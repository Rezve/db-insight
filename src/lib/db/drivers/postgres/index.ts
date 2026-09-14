import type { Pool, QueryResult } from "pg";
import type {
  ConnectInput,
  DbDriver,
  NeutralResult,
  PlanMode,
  PlanResult,
  PoolHandle,
  QueryParams,
} from "../../types";
import { toPostgres } from "../../bind";
import { normalizeRows } from "../../normalize";
import { postgresIntrospection, quoteId } from "./queries";
import { postgresDdl } from "./ddl";

const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);

interface PgPoolState {
  pool: Pool;
  /** Notices arrive on the pool asynchronously, not per query. */
  notices: string[];
  closed: boolean;
}

function state(handle: PoolHandle): PgPoolState {
  return handle.raw as PgPoolState;
}

function buildConfig(input: ConnectInput, database: string) {
  // Postgres has no named-instance syntax; strip anything after a comma so a
  // pasted "host,port" still resolves.
  const [host, portFromServer] = input.server.trim().split(",");
  const port = input.port ?? (portFromServer ? parseInt(portFromServer, 10) : undefined);

  return {
    host: host.trim(),
    port: port && !isNaN(port) ? port : 5432,
    database,
    user: input.username,
    password: input.password,
    // `trustServerCertificate` maps onto skipping CA verification.
    ssl: input.encrypt
      ? { rejectUnauthorized: !input.trustServerCertificate }
      : false,
    connectionTimeoutMillis: 15000,
    // Matches the SQL Server driver's `requestTimeout: 0` (no statement timeout).
    statement_timeout: 0,
  };
}

function shapeResult(result: QueryResult, messages: string[]): NeutralResult {
  const rows = normalizeRows((result.rows ?? []) as Record<string, unknown>[]);
  return {
    columns: (result.fields ?? []).map((f) => ({
      name: f.name,
      dataType: pgTypeName(f.dataTypeID),
    })),
    rows,
    rowsAffected: [result.rowCount ?? 0],
    messages,
  };
}

/**
 * Maps the common `pg_type` OIDs to readable names. `pg` only reports numeric
 * type IDs, and resolving every one would need a catalog round trip per query.
 */
const PG_TYPE_NAMES: Record<number, string> = {
  16: "bool", 17: "bytea", 20: "int8", 21: "int2", 23: "int4", 25: "text",
  114: "json", 700: "float4", 701: "float8", 1042: "bpchar", 1043: "varchar",
  1082: "date", 1083: "time", 1114: "timestamp", 1184: "timestamptz",
  1700: "numeric", 2950: "uuid", 3802: "jsonb",
};

function pgTypeName(oid: number): string {
  return PG_TYPE_NAMES[oid] ?? `oid:${oid}`;
}

async function runQuery(
  handle: PoolHandle,
  sql: string,
  params?: QueryParams
): Promise<NeutralResult> {
  const s = state(handle);
  const { sql: text, values } = toPostgres(sql, params);

  // Take whatever notices accumulated for this query and reset the buffer.
  const before = s.notices.length;
  const result = await s.pool.query(text, values);
  const messages = s.notices.splice(before);

  return shapeResult(result, messages);
}

export const postgresDriver: DbDriver = {
  engine: "postgres",
  label: "PostgreSQL",
  defaultPort: 5432,
  defaultSchema: "public",
  bootstrapDatabase: "postgres",
  formatterDialect: "postgresql",

  capabilities: {
    schemas: true,
    storedProcedures: true,
    functions: true,
    identityColumns: true,
    computedColumns: true,
    columnComments: true,
    tableSizes: true,
    indexUsageStats: true,
    missingIndexAdvisor: false,
    indexDisableRebuild: false,
    includeColumns: true,
    filteredIndexes: true,
    serverUptime: true,
    sessionStatistics: false,
    windowsAuth: false,
    // A Postgres connection is bound to one database for its lifetime.
    databasePinnedToConnection: true,
    queryPlan: "explain-text",
  },

  buildConfig,

  async createPool(config) {
    const { Pool } = await import("pg");
    const pool = new Pool(config as never);
    const s: PgPoolState = { pool, notices: [], closed: false };

    pool.on("error", () => {
      // Idle client errors would otherwise crash the process.
    });
    pool.on("connect", (client) => {
      client.on("notice", (n) => {
        if (n.message) s.notices.push(n.message);
      });
    });

    // Fail fast if the credentials are wrong, matching mssql's connect().
    const client = await pool.connect();
    client.release();

    return { engine: "postgres", raw: s };
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
    // ANALYZE actually runs the statement, so it is only used for actual plans.
    const prefix = mode === "actual" ? "EXPLAIN (ANALYZE, BUFFERS, VERBOSE)" : "EXPLAIN (VERBOSE)";
    const result = await runQuery(handle, `${prefix} ${sql}`);
    const planText = result.rows
      .map((r) => String(Object.values(r)[0] ?? ""))
      .join("\n");
    return { planText };
  },

  async listDatabases(handle) {
    const result = await runQuery(
      handle,
      `
        SELECT datname AS name
        FROM pg_database
        WHERE datallowconn AND NOT datistemplate
        ORDER BY
          CASE WHEN datname IN ('postgres', 'template0', 'template1') THEN 1 ELSE 0 END,
          datname
      `
    );
    return result.rows.map((r) => String(r.name));
  },

  isSystemDatabase: (name) => SYSTEM_DATABASES.has(name),

  quoteId,

  introspection: postgresIntrospection,
  ddl: postgresDdl,
};
