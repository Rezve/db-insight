import type { DbEngine } from "@/lib/db/types";

/**
 * Read-only guard for SQL supplied by MCP clients.
 *
 * Fails closed: anything that cannot be confidently classified as a single
 * SELECT/WITH statement is rejected. This is the only write protection on
 * SQL Server; Postgres and MySQL additionally run inside a READ ONLY
 * transaction (see each driver's `readOnlyQuery`).
 */

export class ReadOnlyViolation extends Error {}

const FORBIDDEN_WORDS = [
  // writes / DDL / privileges
  "insert", "update", "delete", "merge", "drop", "alter", "create", "truncate",
  "rename", "replace", "grant", "revoke", "deny", "upsert",
  // execution and session control
  "exec", "execute", "call", "declare", "set", "use", "prepare", "deallocate",
  "do", "handler", "load", "copy", "lock", "unlock", "begin", "commit",
  "rollback", "savepoint", "vacuum", "analyze", "reindex", "cluster", "refresh",
  "comment", "listen", "notify", "discard", "reset", "checkpoint",
  // file / server access and admin
  "into", "outfile", "dumpfile", "backup", "restore", "shutdown", "kill",
  "dbcc", "bulk", "openrowset", "openquery", "opendatasource", "openxml",
  "waitfor", "readtext", "writetext", "updatetext",
  // locking hints and clauses
  "updlock", "xlock", "holdlock", "tablockx", "readpast",
  // functions with side effects or file/network access
  "nextval", "setval", "pg_sleep", "pg_read_file", "pg_read_binary_file",
  "pg_ls_dir", "lo_import", "lo_export", "lo_unlink", "dblink", "dblink_exec",
  "pg_terminate_backend", "pg_cancel_backend", "pg_reload_conf", "set_config",
  "sleep", "load_file", "get_lock", "release_lock", "benchmark",
];

const FORBIDDEN_RE = new RegExp(`(?<![\\w$@#])(?:${FORBIDDEN_WORDS.join("|")})(?![\\w$])`, "i");
const FORBIDDEN_PATTERNS: RegExp[] = [
  /(?<![\w$])(?:xp|sp)_\w*/i, // SQL Server extended / system procedures
  /\bfor\s+(?:no\s+key\s+)?(?:share|key)\b/i, // Postgres row locks (FOR UPDATE is caught above)
  /\bnext\s+value\s+for\b/i, // SQL Server sequences
];

const isWhitespace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v";

/**
 * Removes comments and the contents of string literals / quoted identifiers,
 * leaving only the syntactic skeleton. Throws on anything unterminated or on
 * constructs that hide executable text (MySQL version-conditional comments).
 */
export function stripSql(engine: DbEngine, sql: string): string {
  const out: string[] = [];
  const n = sql.length;
  const nestedComments = engine !== "mysql";
  let i = 0;

  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];

    // Line comments. MySQL only treats `--` as a comment when followed by whitespace.
    if (
      (c === "-" && next === "-" && (engine !== "mysql" || i + 2 >= n || isWhitespace(sql[i + 2]) || sql.charCodeAt(i + 2) < 32)) ||
      (c === "#" && engine === "mysql")
    ) {
      while (i < n && sql[i] !== "\n" && sql[i] !== "\r") i++;
      out.push(" ");
      continue;
    }

    // Block comments.
    if (c === "/" && next === "*") {
      const flag = sql[i + 2];
      if (engine === "mysql" && (flag === "!" || (flag === "M" && sql[i + 3] === "!"))) {
        throw new ReadOnlyViolation("Executable comments are not allowed.");
      }
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "*" && sql[i + 1] === "/") { depth--; i += 2; }
        else if (nestedComments && sql[i] === "/" && sql[i + 1] === "*") { depth++; i += 2; }
        else i++;
      }
      if (depth > 0) throw new ReadOnlyViolation("Unterminated comment.");
      out.push(" ");
      continue;
    }

    // Postgres dollar-quoted strings: $tag$ ... $tag$
    if (c === "$" && engine === "postgres") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const end = sql.indexOf(m[0], i + m[0].length);
        if (end === -1) throw new ReadOnlyViolation("Unterminated dollar-quoted string.");
        i = end + m[0].length;
        out.push(" ");
        continue;
      }
    }

    // Quoted strings / identifiers.
    if (c === "'" || c === '"' || c === "`" || (c === "[" && engine === "sqlserver")) {
      const close = c === "[" ? "]" : c;
      const backslashEscapes =
        engine === "mysql" ||
        (engine === "postgres" && c === "'" && /[eE]$/.test(sql.slice(Math.max(0, i - 1), i)) && !/[\w$]$/.test(sql.slice(Math.max(0, i - 2), i - 1)));
      i++;
      let closed = false;
      while (i < n) {
        const d = sql[i];
        if (backslashEscapes && d === "\\") { i += 2; continue; }
        if (d === close) {
          if (sql[i + 1] === close) { i += 2; continue; } // doubled quote escape
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) throw new ReadOnlyViolation("Unterminated string or quoted identifier.");
      out.push(" ? ");
      continue;
    }

    out.push(c);
    i++;
  }
  return out.join("");
}

/** Throws `ReadOnlyViolation` unless `sql` is a single read-only SELECT/WITH statement. */
export function assertReadOnly(engine: DbEngine, sql: string): void {
  if (typeof sql !== "string" || !sql.trim()) throw new ReadOnlyViolation("Empty query.");
  if (sql.length > 20000) throw new ReadOnlyViolation("Query is too long (max 20,000 characters).");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000]/.test(sql)) throw new ReadOnlyViolation("Query contains invalid characters.");

  const skeleton = stripSql(engine, sql).trim().replace(/;\s*$/, "").trim();

  if (skeleton.includes(";")) throw new ReadOnlyViolation("Only a single statement is allowed.");

  // A leading `(` is allowed for parenthesised selects.
  const first = /^[\s(]*([A-Za-z]+)/.exec(skeleton)?.[1]?.toLowerCase();
  if (first !== "select" && first !== "with") {
    throw new ReadOnlyViolation("Only SELECT queries are allowed.");
  }

  const hit = FORBIDDEN_RE.exec(skeleton) ?? FORBIDDEN_PATTERNS.map((p) => p.exec(skeleton)).find(Boolean);
  if (hit) {
    throw new ReadOnlyViolation(`Statement is not read-only (found "${hit[0].trim()}").`);
  }
}
