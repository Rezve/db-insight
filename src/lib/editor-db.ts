import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { encrypt, decrypt } from "./crypto";
import { getDataDir } from "@/lib/config";

declare global {
  // eslint-disable-next-line no-var
  var __editorDb: Database.Database | undefined;
}

function getDb(): Database.Database {
  if (global.__editorDb) return global.__editorDb;

  const dataDir = getDataDir();
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
    CREATE TABLE IF NOT EXISTS closed_tabs (
      id            TEXT NOT NULL,
      server_name   TEXT NOT NULL DEFAULT '',
      database_name TEXT NOT NULL DEFAULT '',
      name          TEXT NOT NULL,
      sql_text      TEXT NOT NULL DEFAULT '',
      closed_at     TEXT NOT NULL DEFAULT (datetime('now'))
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
    CREATE TABLE IF NOT EXISTS mcp_audit_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ts            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      server_name   TEXT NOT NULL DEFAULT '',
      database_name TEXT NOT NULL DEFAULT '',
      client        TEXT NOT NULL DEFAULT '',
      tool          TEXT NOT NULL,
      input         TEXT NOT NULL DEFAULT '',
      outcome       TEXT NOT NULL,
      row_count     INTEGER,
      duration_ms   INTEGER,
      detail        TEXT
    );
    CREATE TABLE IF NOT EXISTS mcp_tokens (
      server_name   TEXT NOT NULL,
      database_name TEXT NOT NULL,
      token_enc     TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (server_name, database_name)
    );
    CREATE TABLE IF NOT EXISTS mcp_prefs (
      server_name      TEXT NOT NULL,
      database_name    TEXT NOT NULL,
      enabled          INTEGER NOT NULL DEFAULT 0,
      require_approval INTEGER NOT NULL DEFAULT 1,
      updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (server_name, database_name)
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
  // Installs that predate multi-engine support have no `engine` column, so
  // inserts would fail against their existing table.
  if (!connCols.includes("engine")) {
    try {
      db.exec("ALTER TABLE connections ADD COLUMN engine TEXT NOT NULL DEFAULT 'sqlserver'");
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

export interface ClosedTab {
  id: string;
  name: string;
  sql: string;
  closedAt: string;
}

export function getClosedTabs(serverName: string, databaseName: string): ClosedTab[] {
  const db = getDb();
  return db
    .prepare("SELECT id, name, sql_text AS sql, closed_at AS closedAt FROM closed_tabs WHERE server_name = ? AND database_name = ? ORDER BY closed_at DESC")
    .all(serverName, databaseName) as ClosedTab[];
}

export function addClosedTab(tab: PersistedTab, serverName: string, databaseName: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO closed_tabs (id, server_name, database_name, name, sql_text) VALUES (?, ?, ?, ?, ?)"
  ).run(tab.id, serverName, databaseName, tab.name, tab.sql);
}

export function deleteClosedTab(id: string, closedAt: string, serverName: string, databaseName: string): void {
  const db = getDb();
  db.prepare(
    "DELETE FROM closed_tabs WHERE id = ? AND closed_at = ? AND server_name = ? AND database_name = ?"
  ).run(id, closedAt, serverName, databaseName);
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

/** Listing is for the browser, so the encrypted password is deliberately omitted. */
export type SavedConnectionSummary = Omit<SavedConnection, "password_enc">;

export function listConnections(): SavedConnectionSummary[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, tag, color, engine, server, port, auth_mode, username,
              database_name, encrypt, trust_cert, ask_to_save, created_at
       FROM connections ORDER BY created_at DESC`
    )
    .all() as SavedConnectionSummary[];
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

/**
 * Engine is part of the key: a Postgres and a MySQL server can share a host,
 * port and database name without being the same connection.
 */
export function findConnectionByCredentials(engine: string, server: string, port: number | undefined, username: string | undefined, database_name: string | undefined): SavedConnection | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM connections WHERE engine = ? AND server = ? AND port IS ? AND username IS ? AND database_name IS ? LIMIT 1")
    .get(engine, server, port ?? null, username ?? null, database_name ?? null) as SavedConnection | undefined;
}

export function encryptPassword(password: string): string {
  return encrypt(password);
}

export function decryptPassword(encrypted: string): string {
  return decrypt(encrypted);
}


export interface McpAuditEntry {
  id: number;
  ts: string;
  client: string;
  tool: string;
  input: string;
  outcome: string;
  rowCount: number | null;
  durationMs: number | null;
  detail: string | null;
}

export interface McpAuditInput {
  serverName: string;
  databaseName: string;
  client: string;
  tool: string;
  input: string;
  outcome: string;
  rowCount?: number | null;
  durationMs?: number | null;
  detail?: string | null;
}

const MCP_AUDIT_RETENTION_DAYS = 30;

export function addMcpAudit(entry: McpAuditInput): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO mcp_audit_log (server_name, database_name, client, tool, input, outcome, row_count, duration_ms, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.serverName,
    entry.databaseName,
    entry.client,
    entry.tool,
    entry.input.slice(0, 20000),
    entry.outcome,
    entry.rowCount ?? null,
    entry.durationMs ?? null,
    entry.detail?.slice(0, 2000) ?? null
  );
  db.prepare("DELETE FROM mcp_audit_log WHERE ts < strftime('%Y-%m-%dT%H:%M:%fZ','now', ?)").run(
    `-${MCP_AUDIT_RETENTION_DAYS} days`
  );
}

/** The persistent MCP bearer token for a server/database, if one was generated before. */
export function getMcpToken(serverName: string, databaseName: string): string | null {
  const row = getDb()
    .prepare("SELECT token_enc FROM mcp_tokens WHERE server_name = ? AND database_name = ?")
    .get(serverName, databaseName) as { token_enc: string } | undefined;
  if (!row) return null;
  try {
    return decrypt(row.token_enc);
  } catch {
    return null;
  }
}

export function setMcpToken(serverName: string, databaseName: string, token: string): void {
  getDb()
    .prepare(
      `INSERT INTO mcp_tokens (server_name, database_name, token_enc) VALUES (?, ?, ?)
       ON CONFLICT(server_name, database_name)
       DO UPDATE SET token_enc = excluded.token_enc, created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    )
    .run(serverName, databaseName, encrypt(token));
}

export interface McpPrefs {
  enabled: boolean;
  requireApproval: boolean;
}

/** The user's last MCP choice for a server/database, applied again on the next connect. */
export function getMcpPrefs(serverName: string, databaseName: string): McpPrefs | null {
  const row = getDb()
    .prepare("SELECT enabled, require_approval FROM mcp_prefs WHERE server_name = ? AND database_name = ?")
    .get(serverName, databaseName) as { enabled: number; require_approval: number } | undefined;
  return row ? { enabled: row.enabled === 1, requireApproval: row.require_approval === 1 } : null;
}

export function setMcpPrefs(serverName: string, databaseName: string, prefs: McpPrefs): void {
  getDb()
    .prepare(
      `INSERT INTO mcp_prefs (server_name, database_name, enabled, require_approval) VALUES (?, ?, ?, ?)
       ON CONFLICT(server_name, database_name)
       DO UPDATE SET enabled = excluded.enabled, require_approval = excluded.require_approval,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    )
    .run(serverName, databaseName, prefs.enabled ? 1 : 0, prefs.requireApproval ? 1 : 0);
}

export function clearMcpAudit(serverName: string, databaseName: string): void {
  getDb().prepare("DELETE FROM mcp_audit_log WHERE server_name = ? AND database_name = ?").run(serverName, databaseName);
}

export function listMcpAudit(serverName: string, databaseName: string, limit = 100): McpAuditEntry[] {
  return getDb()
    .prepare(
      `SELECT id, ts, client, tool, input, outcome, row_count AS rowCount, duration_ms AS durationMs, detail
       FROM mcp_audit_log WHERE server_name = ? AND database_name = ?
       ORDER BY id DESC LIMIT ?`
    )
    .all(serverName, databaseName, limit) as McpAuditEntry[];
}
