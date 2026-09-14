import type { ConnectionPool, ISqlType, IResult } from "mssql";
import type {
  ConnectInput,
  DbDriver,
  NeutralResult,
  PlanMode,
  PlanResult,
  PoolHandle,
  QueryParams,
} from "../../types";
import { sqlServerIntrospection, quoteId } from "./queries";
import { sqlServerDdl } from "./ddl";

const SYSTEM_DATABASES = new Set(["master", "model", "msdb", "tempdb"]);

function pool(handle: PoolHandle): ConnectionPool {
  return handle.raw as ConnectionPool;
}

/**
 * Builds the `mssql` config. The `server` field accepts SQL Server's native
 * `host,port` and `host\INSTANCE` forms in addition to a plain host.
 */
function buildConfig(input: ConnectInput, database: string) {
  let serverHost = input.server.trim();
  let instanceName: string | undefined;
  let resolvedPort: number | undefined = input.port;

  const commaIdx = serverHost.indexOf(",");
  if (commaIdx !== -1) {
    const portStr = serverHost.slice(commaIdx + 1).trim();
    serverHost = serverHost.slice(0, commaIdx).trim();
    const parsed = parseInt(portStr, 10);
    if (!isNaN(parsed)) resolvedPort = parsed;
  } else {
    const backslashIdx = serverHost.indexOf("\\");
    if (backslashIdx !== -1) {
      instanceName = serverHost.slice(backslashIdx + 1).trim();
      serverHost = serverHost.slice(0, backslashIdx).trim();
    }
  }

  return {
    server: serverHost,
    ...(resolvedPort ? { port: resolvedPort } : {}),
    database,
    ...(input.authMode === "sql"
      ? { user: input.username, password: input.password }
      : {}),
    options: {
      encrypt: input.encrypt,
      trustServerCertificate: input.trustServerCertificate,
      ...(instanceName ? { instanceName } : {}),
      ...(input.authMode === "windows" ? { trustedConnection: true } : {}),
    },
    connectionTimeout: 15000,
    requestTimeout: 0,
  };
}

async function mssqlTypeFor(
  param: { type?: string; maxLength?: number }
): Promise<ISqlType | (() => ISqlType) | undefined> {
  const sql = await import("mssql");
  switch (param.type) {
    case "string":
      return param.maxLength ? sql.NVarChar(param.maxLength) : sql.NVarChar(sql.MAX);
    case "number":
      return sql.Float;
    case "boolean":
      return sql.Bit;
    case "datetime":
      return sql.DateTime2;
    case "binary":
      return sql.VarBinary(sql.MAX);
    case "json":
      return sql.NVarChar(sql.MAX);
    default:
      return undefined;
  }
}

function shapeResult(result: IResult<unknown>, messages: string[]): NeutralResult {
  const recordsets = Array.isArray(result.recordsets)
    ? (result.recordsets as Record<string, unknown>[][])
    : [];

  const rows = (result.recordset as Record<string, unknown>[] | undefined) ?? [];

  const columns = result.recordset?.columns
    ? Object.entries(result.recordset.columns).map(([name, meta]) => ({
        name,
        dataType:
          (meta as { type?: { declaration?: string } }).type?.declaration ?? "unknown",
      }))
    : rows.length > 0
    ? Object.keys(rows[0]).map((name) => ({ name, dataType: "unknown" }))
    : [];

  return {
    columns,
    rows,
    rowsAffected: result.rowsAffected ?? [],
    messages,
    recordsets,
  };
}

async function runQuery(
  handle: PoolHandle,
  sql: string,
  params?: QueryParams
): Promise<NeutralResult> {
  const request = pool(handle).request();
  const messages: string[] = [];
  request.on("info", (info: { message: string }) => {
    if (info.message?.trim()) messages.push(info.message);
  });

  if (params) {
    for (const [name, param] of Object.entries(params)) {
      const type = await mssqlTypeFor(param);
      if (type) request.input(name, type, param.value);
      else request.input(name, param.value);
    }
  }

  return shapeResult(await request.query(sql), messages);
}

export const sqlServerDriver: DbDriver = {
  engine: "sqlserver",
  label: "SQL Server / Azure SQL",
  defaultPort: 1433,
  defaultSchema: "dbo",
  bootstrapDatabase: "master",
  formatterDialect: "tsql",

  capabilities: {
    schemas: true,
    storedProcedures: true,
    functions: true,
    identityColumns: true,
    computedColumns: true,
    columnComments: true,
    tableSizes: true,
    indexUsageStats: true,
    missingIndexAdvisor: true,
    indexDisableRebuild: true,
    includeColumns: true,
    filteredIndexes: true,
    serverUptime: true,
    sessionStatistics: true,
    windowsAuth: true,
    databasePinnedToConnection: false,
    queryPlan: "showplan-xml",
  },

  buildConfig,

  async createPool(config) {
    const { ConnectionPool } = await import("mssql");
    const p = new ConnectionPool(config as never);
    await p.connect();
    return { engine: "sqlserver", raw: p };
  },

  async closePool(handle) {
    await pool(handle).close();
  },

  isConnected: (handle) => pool(handle).connected,

  query: runQuery,

  async explain(handle, sql, mode: PlanMode): Promise<PlanResult> {
    if (mode !== "estimated") return {};

    // SET SHOWPLAN_XML must be the only statement in its batch, so this runs as
    // three sequential requests on the same pool.
    const p = pool(handle);
    await p.request().query("SET SHOWPLAN_XML ON");
    try {
      const result = await runQuery(handle, sql);
      return { planXml: extractPlanXml(result) };
    } finally {
      // Always turn it back off so the connection stays reusable.
      await p.request().query("SET SHOWPLAN_XML OFF").catch(() => {});
    }
  },

  async listDatabases(handle) {
    const result = await runQuery(
      handle,
      `
        SELECT name
        FROM sys.databases
        WHERE state_desc = 'ONLINE'
        ORDER BY
          CASE WHEN name IN ('master','model','msdb','tempdb') THEN 1 ELSE 0 END,
          name
      `
    );
    return result.rows.map((r) => String(r.name));
  },

  isSystemDatabase: (name) => SYSTEM_DATABASES.has(name),

  quoteId,

  introspection: sqlServerIntrospection,
  ddl: sqlServerDdl,
};

/** Finds the ShowPlan XML column in any of a result's record sets. */
export function extractPlanXml(result: NeutralResult): string | undefined {
  const sets = result.recordsets?.length ? result.recordsets : [result.rows];
  for (const rs of sets) {
    const row = rs?.[0];
    if (!row) continue;
    const key = Object.keys(row).find(
      (k) => k.toLowerCase().includes("showplan") || k.toLowerCase().includes("xml")
    );
    if (key && typeof row[key] === "string") return row[key] as string;
  }
  return undefined;
}
