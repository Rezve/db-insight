import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { DatabaseSummary } from "@/types/db";

declare global {
  // eslint-disable-next-line no-var
  var __statsDb: Database.Database | undefined;
}

function getDb(): Database.Database {
  if (global.__statsDb) return global.__statsDb;

  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, "editor.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS db_snapshots (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      server_name             TEXT    NOT NULL,
      database_name           TEXT    NOT NULL,
      snapshot_date           TEXT    NOT NULL,
      captured_at             TEXT    NOT NULL,
      total_size_gb           REAL    NOT NULL DEFAULT 0,
      data_size_gb            REAL    NOT NULL DEFAULT 0,
      index_size_gb           REAL    NOT NULL DEFAULT 0,
      largest_table_name      TEXT,
      total_rows              INTEGER NOT NULL DEFAULT 0,
      total_seeks             INTEGER NOT NULL DEFAULT 0,
      total_scans             INTEGER NOT NULL DEFAULT 0,
      total_lookups           INTEGER NOT NULL DEFAULT 0,
      total_updates           INTEGER NOT NULL DEFAULT 0,
      total_indexes           INTEGER NOT NULL DEFAULT 0,
      disabled_indexes        INTEGER NOT NULL DEFAULT 0,
      unused_index_count      INTEGER NOT NULL DEFAULT 0,
      missing_index_count     INTEGER NOT NULL DEFAULT 0,
      tables_with_missing_idx INTEGER NOT NULL DEFAULT 0,
      table_count             INTEGER NOT NULL DEFAULT 0,
      view_count              INTEGER NOT NULL DEFAULT 0,
      procedure_count         INTEGER NOT NULL DEFAULT 0,
      function_count          INTEGER NOT NULL DEFAULT 0,
      total_column_count      INTEGER NOT NULL DEFAULT 0,
      tables_with_pk          INTEGER NOT NULL DEFAULT 0,
      foreign_key_count       INTEGER NOT NULL DEFAULT 0,
      UNIQUE (server_name, database_name, snapshot_date)
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_lookup
      ON db_snapshots (server_name, database_name, snapshot_date DESC);
  `);

  global.__statsDb = db;
  return db;
}

export interface SnapshotRow {
  id: number;
  server_name: string;
  database_name: string;
  snapshot_date: string;
  captured_at: string;
  total_size_gb: number;
  data_size_gb: number;
  index_size_gb: number;
  largest_table_name: string | null;
  total_rows: number;
  total_seeks: number;
  total_scans: number;
  total_lookups: number;
  total_updates: number;
  total_indexes: number;
  disabled_indexes: number;
  unused_index_count: number;
  missing_index_count: number;
  tables_with_missing_idx: number;
  table_count: number;
  view_count: number;
  procedure_count: number;
  function_count: number;
  total_column_count: number;
  tables_with_pk: number;
  foreign_key_count: number;
}

export function saveSnapshot(
  serverName: string,
  databaseName: string,
  summary: DatabaseSummary
): void {
  const db = getDb();
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const capturedAt = new Date().toISOString();

  db.prepare(`
    INSERT OR IGNORE INTO db_snapshots (
      server_name, database_name, snapshot_date, captured_at,
      total_size_gb, data_size_gb, index_size_gb, largest_table_name,
      total_rows, total_seeks, total_scans, total_lookups, total_updates,
      total_indexes, disabled_indexes, unused_index_count, missing_index_count,
      tables_with_missing_idx, table_count, view_count, procedure_count,
      function_count, total_column_count, tables_with_pk, foreign_key_count
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `).run(
    serverName, databaseName, snapshotDate, capturedAt,
    summary.totalSizeGB, summary.dataSizeGB, summary.indexSizeGB, summary.largestTableName,
    summary.totalRows, summary.totalSeeks, summary.totalScans, summary.totalLookups, summary.totalUpdates,
    summary.totalIndexes, summary.disabledIndexes, summary.unusedIndexCount, summary.missingIndexCount,
    summary.tablesWithMissingIndexes, summary.tableCount, summary.viewCount, summary.procedureCount,
    summary.functionCount, summary.totalColumnCount, summary.tablesWithPK, summary.foreignKeyCount
  );
}

export function getSnapshots(
  databaseName: string,
  limitDays = 90
): SnapshotRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM db_snapshots
    WHERE LOWER(database_name) = LOWER(?)
    ORDER BY snapshot_date ASC
    LIMIT ?
  `).all(databaseName, limitDays) as SnapshotRow[];
}

export function getLatestSnapshot(databaseName: string): SnapshotRow | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM db_snapshots
    WHERE LOWER(database_name) = LOWER(?)
    ORDER BY snapshot_date DESC
    LIMIT 1
  `).get(databaseName) as SnapshotRow | undefined;
}
