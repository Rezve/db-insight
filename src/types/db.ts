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
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  maxLength: number | null;
}

export interface SchemaTable {
  schema: string;
  name: string;
  columns: ColumnInfo[];
}

export interface SchemaRoutine {
  schema: string;
  name: string;
  type: "PROCEDURE" | "FUNCTION";
}

export interface SchemaData {
  tables: SchemaTable[];
  storedProcedures: SchemaRoutine[];
  functions: SchemaRoutine[];
}

export interface QueryResult {
  columns: { name: string; dataType: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
  error?: string;
  lineNumber?: number;
}
