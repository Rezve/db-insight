import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { encrypt, decrypt } from "./crypto";

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
    CREATE TABLE IF NOT EXISTS connections (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      tag           TEXT,
      color         TEXT,
      engine        TEXT NOT NULL DEFAULT 'sqlserver',
      server        TEXT NOT NULL,
      port          INTEGER,
      auth_mode     TEXT NOT NULL DEFAULT 'sql',
      username      TEXT,
      password_enc  TEXT,
      database_name TEXT,
      encrypt       INTEGER NOT NULL DEFAULT 1,
      trust_cert    INTEGER NOT NULL DEFAULT 0,
      ask_to_save   INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: add connection-scoping columns if the table predates this change
  const cols = (db.prepare("PRAGMA table_info(editor_tabs)").all() as { name: string }[]).map(c => c.name);
  if (!cols.includes("server_name"))   db.exec("ALTER TABLE editor_tabs ADD COLUMN server_name TEXT NOT NULL DEFAULT ''");
  if (!cols.includes("database_name")) db.exec("ALTER TABLE editor_tabs ADD COLUMN database_name TEXT NOT NULL DEFAULT ''");

  // Migration: add database_name and ask_to_save to connections if they don't exist
  const connCols = (db.prepare("PRAGMA table_info(connections)").all() as { name: string }[]).map(c => c.name);
  if (!connCols.includes("database_name")) {
    try {
      db.exec("ALTER TABLE connections ADD COLUMN database_name TEXT");
    } catch (err) {
      // Column might already exist, ignore
    }
  }
  if (!connCols.includes("ask_to_save")) {
    try {
      db.exec("ALTER TABLE connections ADD COLUMN ask_to_save INTEGER NOT NULL DEFAULT 1");
    } catch (err) {
      // Column might already exist, ignore
    }
  }

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

export interface SavedConnection {
  id: string;
  name: string;
  tag?: string;
  color?: string;
  engine: string;
  server: string;
  port?: number;
  auth_mode: string;
  username?: string;
  password_enc?: string;
  database_name?: string;
  encrypt: number;
  trust_cert: number;
  ask_to_save: number;
  created_at: string;
}

export function listConnections(): SavedConnection[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM connections ORDER BY created_at DESC")
    .all() as SavedConnection[];
}

export function getConnection(id: string): SavedConnection | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM connections WHERE id = ?")
    .get(id) as SavedConnection | undefined;
}

export function saveConnection(conn: SavedConnection): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO connections (id, name, tag, color, engine, server, port, auth_mode, username, password_enc, database_name, encrypt, trust_cert, ask_to_save, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    conn.id,
    conn.name,
    conn.tag || null,
    conn.color || null,
    conn.engine,
    conn.server,
    conn.port || null,
    conn.auth_mode,
    conn.username || null,
    conn.password_enc || null,
    conn.database_name || null,
    conn.encrypt,
    conn.trust_cert,
    conn.ask_to_save,
    conn.created_at
  );
}

export function deleteConnection(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM connections WHERE id = ?").run(id);
}

export function updateConnectionAskToSave(id: string, askToSave: boolean): void {
  const db = getDb();
  db.prepare("UPDATE connections SET ask_to_save = ? WHERE id = ?").run(askToSave ? 1 : 0, id);
}

export function encryptPassword(password: string): string {
  return encrypt(password);
}

export function decryptPassword(encrypted: string): string {
  return decrypt(encrypted);
}
