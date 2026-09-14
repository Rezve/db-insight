import type { DbEngine } from "@/lib/db/types";

/**
 * Namespaces per-connection local state (editor tabs, closed tabs, history
 * snapshots) by engine as well as server.
 *
 * Those tables are keyed on `(server_name, database_name)`, which was
 * unambiguous while SQL Server was the only engine. It no longer is: a Postgres
 * and a MySQL server can both be `localhost` with a database of the same name.
 *
 * SQL Server keeps its bare server name so existing rows stay addressable —
 * this needs no migration, and `db_snapshots`' UNIQUE constraint (which SQLite
 * cannot alter in place) keeps working.
 */
export function scopeKey(engine: DbEngine | undefined, serverName: string): string {
  if (!engine || engine === "sqlserver") return serverName;
  return `${engine}:${serverName}`;
}
