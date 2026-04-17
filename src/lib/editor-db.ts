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
      id       TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      sql_text TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS editor_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

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

export function loadEditorState(): EditorState {
  const db = getDb();
  const tabs = db
    .prepare("SELECT id, name, sql_text AS sql FROM editor_tabs ORDER BY position ASC")
    .all() as PersistedTab[];
  const row = db
    .prepare("SELECT value FROM editor_settings WHERE key = 'activeTabId'")
    .get() as { value: string } | undefined;
  return { tabs, activeTabId: row?.value ?? "" };
}

export function saveEditorState(state: EditorState): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM editor_tabs").run();
    const insert = db.prepare(
      "INSERT INTO editor_tabs (id, name, sql_text, position) VALUES (?, ?, ?, ?)"
    );
    state.tabs.forEach((t, i) => insert.run(t.id, t.name, t.sql, i));
    db.prepare(
      "INSERT OR REPLACE INTO editor_settings (key, value) VALUES ('activeTabId', ?)"
    ).run(state.activeTabId);
  })();
}
