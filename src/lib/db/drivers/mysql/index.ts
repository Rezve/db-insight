import type { Pool, FieldPacket, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type {
  ConnectInput,
  DbDriver,
  NeutralResult,
  PlanMode,
  PlanResult,
  PoolHandle,
  QueryParams,
} from "../../types";
import { toMySql } from "../../bind";
import { normalizeRows } from "../../normalize";
import { mysqlIntrospection, quoteId } from "./queries";
import { mysqlDdl } from "./ddl";

const SYSTEM_DATABASES = new Set([
  "information_schema",
  "mysql",
  "performance_schema",
  "sys",
]);

interface MySqlPoolState {
  pool: Pool;
  closed: boolean;
}

function state(handle: PoolHandle): MySqlPoolState {
  return handle.raw as MySqlPoolState;
}

function buildConfig(input: ConnectInput, database: string) {
  const [host, portFromServer] = input.server.trim().split(",");
  const port = input.port ?? (portFromServer ? parseInt(portFromServer, 10) : undefined);

  return {
    host: host.trim(),
    port: port && !isNaN(port) ? port : 3306,
    // MySQL can connect without a default database selected.
    ...(database ? { database } : {}),
    user: input.username,
    password: input.password,
    ssl: input.encrypt
      ? { rejectUnauthorized: !input.trustServerCertificate }
      : undefined,
    connectTimeout: 15000,
    waitForConnections: true,
    connectionLimit: 10,
    // Return BIGINT as a string only when the value would lose precision as a
    // JS number. Forcing every big number to a string would also stringify
    // ordinary COUNT(*) results and information_schema lengths.
    supportBigNumbers: true,
    bigNumberStrings: false,
    dateStrings: false,
    multipleStatements: false,
  };
}

/** MySQL exposes column types as numeric codes; these are the common ones. */
const MYSQL_TYPE_NAMES: Record<number, string> = {
  0: "decimal", 1: "tinyint", 2: "smallint", 3: "int", 4: "float", 5: "double",
  7: "timestamp", 8: "bigint", 9: "mediumint", 10: "date", 11: "time",
  12: "datetime", 13: "year", 15: "varchar", 16: "bit", 245: "json",
  246: "decimal", 252: "blob", 253: "varchar", 254: "char",
};

function mysqlTypeName(code: number | undefined): string {
  return code != null ? MYSQL_TYPE_NAMES[code] ?? `type:${code}` : "unknown";
}

async function runQuery(
  handle: PoolHandle,
  sql: string,
  params?: QueryParams
): Promise<NeutralResult> {
  const { sql: text, values } = toMySql(sql, params);
  const [result, fields] = await state(handle).pool.query(text, values);

  // DML returns a header rather than rows.
  if (!Array.isArray(result)) {
    const header = result as ResultSetHeader;
    return {
      columns: [],
      rows: [],
      rowsAffected: [header.affectedRows ?? 0],
      messages: header.info ? [header.info] : [],
    };
  }

  const rows = normalizeRows(result as RowDataPacket[] as Record<string, unknown>[]);
  return {
    columns: ((fields as FieldPacket[]) ?? []).map((f) => ({
      name: f.name,
      dataType: mysqlTypeName(f.type),
    })),
    rows,
    rowsAffected: [rows.length],
    messages: [],
  };
}

export const mysqlDriver: DbDriver = {
  engine: "mysql",
  label: "MySQL",
  defaultPort: 3306,
  // MySQL has no schema tier above the database; the database is the namespace.
  defaultSchema: "",
  bootstrapDatabase: undefined,
  formatterDialect: "mysql",

  capabilities: {
    schemas: false,
    storedProcedures: true,
    functions: true,
    identityColumns: true,
    computedColumns: true,
    // Comments require restating the whole column definition.
    columnComments: false,
    tableSizes: true,
    indexUsageStats: true,
    missingIndexAdvisor: false,
    indexDisableRebuild: false,
    includeColumns: false,
    filteredIndexes: false,
    serverUptime: true,
    sessionStatistics: false,
    windowsAuth: false,
    databasePinnedToConnection: false,
    queryPlan: "explain-text",
  },

  buildConfig,

  async createPool(config) {
    const mysql = await import("mysql2/promise");
    const pool = mysql.createPool(config as never);

    // Fail fast on bad credentials, matching the other drivers.
    const conn = await pool.getConnection();
    conn.release();

    return { engine: "mysql", raw: { pool, closed: false } satisfies MySqlPoolState };
  },

  async closePool(handle) {
    const s = state(handle);
    s.closed = true;
    await s.pool.end();
  },

  isConnected: (handle) => !state(handle).closed,

  query: runQuery,

  async explain(handle, sql, mode: PlanMode): Promise<PlanResult> {
    if (mode === "off") return {};
    const result = await runQuery(handle, `EXPLAIN FORMAT=JSON ${sql}`);
    const first = result.rows[0];
    if (!first) return {};
    const value = Object.values(first)[0];
    if (typeof value !== "string") return {};
    try {
      return { planText: JSON.stringify(JSON.parse(value), null, 2) };
    } catch {
      return { planText: value };
    }
  },

  async listDatabases(handle) {
    const result = await runQuery(
      handle,
      `
        SELECT SCHEMA_NAME AS name
        FROM information_schema.SCHEMATA
        ORDER BY
          CASE WHEN SCHEMA_NAME IN ('information_schema','mysql','performance_schema','sys')
               THEN 1 ELSE 0 END,
          SCHEMA_NAME
      `
    );
    return result.rows.map((r) => String(r.name));
  },

  isSystemDatabase: (name) => SYSTEM_DATABASES.has(name),

  quoteId,

  introspection: mysqlIntrospection,
  ddl: mysqlDdl,
};
