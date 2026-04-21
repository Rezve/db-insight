import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

declare global {
  // eslint-disable-next-line no-var
  var __editorDb: Database.Database | undefined;
}

function getDb(): Database.Database {
  if (global.__editorDb) return global.__editorDb;

  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, "editor.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS editor_tabs (
      id            TEXT PRIMARY KEY,
      server_name   TEXT NOT NULL DEFAULT '',
      database_name TEXT NOT NULL DEFAULT '',
      name          TEXT NOT NULL,
      sql_text      TEXT NOT NULL DEFAULT '',
      position      INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS editor_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migration: add connection-scoping columns if the table predates this change
  const cols = (db.prepare("PRAGMA table_info(editor_tabs)").all() as { name: string }[]).map(c => c.name);
  if (!cols.includes("server_name"))   db.exec("ALTER TABLE editor_tabs ADD COLUMN server_name TEXT NOT NULL DEFAULT ''");
  if (!cols.includes("database_name")) db.exec("ALTER TABLE editor_tabs ADD COLUMN database_name TEXT NOT NULL DEFAULT ''");

  global.__editorDb = db;
  return db;
}

export interface PersistedTab {
  id: string;
  name: string;
  sql: string;
}

export interface EditorState {
  tabs: PersistedTab[];
  activeTabId: string;
}

export function loadEditorState(serverName: string, databaseName: string): EditorState {
  const db = getDb();
  const tabs = db
    .prepare("SELECT id, name, sql_text AS sql FROM editor_tabs WHERE server_name = ? AND database_name = ? ORDER BY position ASC")
    .all(serverName, databaseName) as PersistedTab[];
  const settingsKey = `${serverName}:${databaseName}:activeTabId`;
  const row = db
    .prepare("SELECT value FROM editor_settings WHERE key = ?")
    .get(settingsKey) as { value: string } | undefined;
  return { tabs, activeTabId: row?.value ?? "" };
}

export function saveEditorState(state: EditorState, serverName: string, databaseName: string): void {
  const db = getDb();
  const settingsKey = `${serverName}:${databaseName}:activeTabId`;
  db.transaction(() => {
    db.prepare("DELETE FROM editor_tabs WHERE server_name = ? AND database_name = ?").run(serverName, databaseName);
    const insert = db.prepare(
      "INSERT INTO editor_tabs (id, server_name, database_name, name, sql_text, position) VALUES (?, ?, ?, ?, ?, ?)"
    );
    state.tabs.forEach((t, i) => insert.run(t.id, serverName, databaseName, t.name, t.sql, i));
    db.prepare(
      "INSERT OR REPLACE INTO editor_settings (key, value) VALUES (?, ?)"
    ).run(settingsKey, state.activeTabId);
  })();
}
