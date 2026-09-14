import type { SampleSize, TableColumnDetail, ExtendedColumnDetail, IndexInfo } from "@/types/analysis";

export type DbEngine = "sqlserver" | "postgres" | "mysql";

export const DB_ENGINES: DbEngine[] = ["sqlserver", "postgres", "mysql"];

export function isDbEngine(value: unknown): value is DbEngine {
  return typeof value === "string" && (DB_ENGINES as string[]).includes(value);
}

export type AuthMode = "sql" | "windows";

export interface ConnectInput {
  engine: DbEngine;
  authMode: AuthMode;
  /** "host", "host\INSTANCE" or "host,port" (SQL Server); plain host elsewhere. */
  server: string;
  port?: number;
  username?: string;
  password?: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

/* ------------------------------------------------------------------ *
 * Parameters and results
 * ------------------------------------------------------------------ */

/**
 * Engine-neutral parameter type. Drivers map these onto their own type systems;
 * omitting it lets the driver infer from the JS value.
 */
export type NeutralType = "string" | "number" | "boolean" | "datetime" | "binary" | "json";

export interface QueryParam {
  value: unknown;
  type?: NeutralType;
  /**
   * Declared length for string parameters. Identifiers bind as 128 (SQL Server
   * `sysname`); omit for unbounded values.
   */
  maxLength?: number;
}

export type QueryParams = Record<string, QueryParam>;

/** A query plus its bound parameters, as produced by the introspection builders. */
export interface PreparedQuery {
  sql: string;
  params?: QueryParams;
}

export interface ResultColumn {
  name: string;
  dataType: string;
}

export interface NeutralResult {
  columns: ResultColumn[];
  rows: Record<string, unknown>[];
  rowsAffected: number[];
  /** Driver info/notice messages (mssql `info` events, pg notices). */
  messages: string[];
  /**
   * All result sets, when the engine returns more than one. Only SQL Server
   * currently produces these (actual-execution-plan batches rely on it).
   */
  recordsets?: Record<string, unknown>[][];
}

/** Opaque connection pool wrapper. `raw` is the driver's own pool object. */
export interface PoolHandle {
  engine: DbEngine;
  raw: unknown;
}

export type PlanMode = "off" | "actual" | "estimated";

export interface PlanResult {
  /** SQL Server ShowPlan XML, when the engine produces it. */
  planXml?: string;
  /** EXPLAIN output rendered as text, for engines without a structured plan model. */
  planText?: string;
}

/* ------------------------------------------------------------------ *
 * Capabilities
 * ------------------------------------------------------------------ */

/**
 * What an engine can actually do. The UI hides or disables anything a driver
 * does not declare, rather than failing at query time.
 */
export interface DriverCapabilities {
  /** A real namespace tier above tables (SQL Server `dbo`, Postgres `public`). */
  schemas: boolean;
  storedProcedures: boolean;
  functions: boolean;
  identityColumns: boolean;
  computedColumns: boolean;
  columnComments: boolean;
  tableSizes: boolean;
  indexUsageStats: boolean;
  /** Engine-provided index recommendations (SQL Server missing-index DMVs). */
  missingIndexAdvisor: boolean;
  /** Indexes can be disabled/rebuilt/reorganized in place. */
  indexDisableRebuild: boolean;
  /** Index definitions support non-key INCLUDE columns. */
  includeColumns: boolean;
  /** Partial/filtered indexes. */
  filteredIndexes: boolean;
  serverUptime: boolean;
  /** `SET STATISTICS IO/TIME`-style per-query server messages. */
  sessionStatistics: boolean;
  windowsAuth: boolean;
  /** Connections are pinned to one database; switching requires a new pool. */
  databasePinnedToConnection: boolean;
  queryPlan: "showplan-xml" | "explain-json" | "explain-text" | false;
}

/* ------------------------------------------------------------------ *
 * Introspection
 * ------------------------------------------------------------------ */

export interface IntrospectionQueries {
  listTables(): PreparedQuery;
  listStoredProcedures(): PreparedQuery;
  schemaColumns(): PreparedQuery;
  schemaRoutines(): PreparedQuery;
  schemaForeignKeys(): PreparedQuery;
  schemaParameters(): PreparedQuery;
  spDefinition(schema: string, name: string): PreparedQuery;

  rowCountFast(schema: string, table: string): PreparedQuery;
  rowCountExact(schema: string, table: string): PreparedQuery;

  indexInfo(schema: string, table: string): PreparedQuery;
  indexSizes(schema: string, table: string): PreparedQuery;
  indexUsage(schema: string, table: string): PreparedQuery;
  missingIndexes(schema: string, table: string): PreparedQuery;

  tableSizes(): PreparedQuery;
  tableSize(schema: string, table: string): PreparedQuery;

  tableColumns(schema: string, table: string): PreparedQuery;
  extendedColumnDetails(schema: string, table: string): PreparedQuery;
  fkDetails(schema: string, table: string): PreparedQuery;

  serverStartTime(): PreparedQuery;
  summaryObjectCounts(): PreparedQuery;
  summaryStorage(): PreparedQuery;
  summaryRowCount(): PreparedQuery;
  summaryIndexHealth(): PreparedQuery;
  summaryIndexUsage(): PreparedQuery;
  summaryServerInfo(): PreparedQuery;

  /** `SELECT ... FROM <table>` limited to `limit` rows, for the data grid. */
  previewQuery(schema: string, table: string, limit: number): string;

  /** Column-distribution analysis, which builds SQL per column. */
  distribution: DistributionQueries;
}

export interface DistributionQueries {
  /** Table expression to analyse — the whole table or a sampled subset. */
  sampleClause(schema: string, table: string, sampleSize: SampleSize): string;
  rowCount(sampleClause: string): string;
  baseStats(quotedColumn: string, sampleClause: string, isNumeric: boolean): string;
  topValues(quotedColumn: string, sampleClause: string, totalRows: number, limit: number): string;
  isNumericType(dataType: string): boolean;
  isDateType(dataType: string): boolean;
}

/* ------------------------------------------------------------------ *
 * DDL
 * ------------------------------------------------------------------ */

export interface DdlBuilders {
  createTable(
    schema: string,
    table: string,
    columns: TableColumnDetail[],
    extended?: Map<string, ExtendedColumnDetail>
  ): string;
  indexes(schema: string, table: string, indexes: IndexInfo[]): string;
  missingIndex(
    equalityColumns: string | null,
    inequalityColumns: string | null,
    includedColumns: string | null,
    schema: string,
    table: string,
    idx: number
  ): string;
  alterColumn(
    schema: string,
    table: string,
    column: string,
    dataTypeFull: string,
    isNullable: boolean,
    collation?: string
  ): string;
  setDefault(
    schema: string,
    table: string,
    column: string,
    oldConstraintName: string | null,
    newDefault?: string
  ): string;
  columnComment(
    schema: string,
    table: string,
    column: string,
    comment: string,
    hasExisting: boolean
  ): string;
  dropIndex(schema: string, table: string, indexName: string): string;
  alterIndex(
    schema: string,
    table: string,
    indexName: string,
    action: "DISABLE" | "REBUILD" | "REORGANIZE",
    online?: boolean
  ): string;
  dropConstraint(schema: string, table: string, constraintName: string): string;
  renameColumn(schema: string, table: string, oldName: string, newName: string): string;

  /** Renders a column's full type, e.g. `nvarchar(100)` / `numeric(18, 4)`. */
  formatDataType(col: TableColumnDetail): string;
  /** Types for which a COLLATE clause is meaningful. */
  isCollatableType(dataType: string): boolean;
  /**
   * Statement prefixes `/api/schema/execute-ddl` will run. Each engine allows a
   * different verb set, so the allowlist travels with the driver.
   */
  allowedStatementPrefixes: string[];
}

/* ------------------------------------------------------------------ *
 * Driver
 * ------------------------------------------------------------------ */

export interface DbDriver {
  engine: DbEngine;
  label: string;
  capabilities: DriverCapabilities;
  defaultPort: number;
  /** `dbo` / `public`; empty when the engine has no schema tier (MySQL). */
  defaultSchema: string;
  /** Database to connect to when enumerating databases. */
  bootstrapDatabase?: string;
  /** Dialect name understood by `sql-formatter`. */
  formatterDialect: "tsql" | "postgresql" | "mysql";

  buildConfig(input: ConnectInput, database: string): unknown;
  createPool(config: unknown): Promise<PoolHandle>;
  closePool(pool: PoolHandle): Promise<void>;
  isConnected(pool: PoolHandle): boolean;

  query(pool: PoolHandle, sql: string, params?: QueryParams): Promise<NeutralResult>;
  explain(pool: PoolHandle, sql: string, mode: PlanMode): Promise<PlanResult>;

  listDatabases(pool: PoolHandle): Promise<string[]>;
  isSystemDatabase(name: string): boolean;

  quoteId(name: string): string;

  introspection: IntrospectionQueries;
  ddl: DdlBuilders;
}
