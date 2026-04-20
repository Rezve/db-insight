import type { config as MssqlConfig } from "mssql";

export interface ConnectionConfig extends MssqlConfig {}

export interface ConnectionInfo {
  serverName: string;
  databaseName: string;
  connected: boolean;
}

export interface TableInfo {
  schema: string;
  name: string;
  fullName: string;
  type: "BASE TABLE" | "VIEW";
  sizeGB?: number;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  maxLength: number | null;
  foreignKey?: {
    targetSchema: string;
    targetTable: string;
    targetColumn: string;
  };
}

export interface SchemaTable {
  schema: string;
  name: string;
  columns: ColumnInfo[];
}

export interface RoutineParameter {
  name: string;
  dataType: string;
  maxLength: number | null;
  isOutput: boolean;
  hasDefault: boolean;
}

export interface SchemaRoutine {
  schema: string;
  name: string;
  type: "PROCEDURE" | "FUNCTION";
  parameters?: RoutineParameter[];
}

export interface SchemaData {
  tables: SchemaTable[];
  storedProcedures: SchemaRoutine[];
  functions: SchemaRoutine[];
}

export interface DatabaseSummary {
  tableCount: number;
  viewCount: number;
  procedureCount: number;
  functionCount: number;
  totalColumnCount: number;
  tablesWithPK: number;
  foreignKeyCount: number;
  totalSizeGB: number;
  dataSizeGB: number;
  indexSizeGB: number;
  largestTableName: string | null;
  totalRows: number;
  totalIndexes: number;
  disabledIndexes: number;
  tablesWithMissingIndexes: number;
  missingIndexCount: number;
  totalSeeks: number;
  totalScans: number;
  totalLookups: number;
  totalUpdates: number;
  unusedIndexCount: number;
  serverName: string;
  databaseName: string;
  sqlVersion: string;
  edition: string;
  serverStartTime: string;
  uptimeMinutes: number;
}

export interface QueryResult {
  columns: { name: string; dataType: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
  error?: string;
  lineNumber?: number;
  statistics?: string[];
  planXml?: string;
}
