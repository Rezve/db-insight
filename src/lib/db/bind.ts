import type { QueryParams } from "./types";

export interface PositionalQuery {
  sql: string;
  /** Values in placeholder order. */
  values: unknown[];
}

/**
 * Rewrites the neutral `@name` placeholder style into an engine's positional
 * style (`$1..$n` for Postgres, `?` for MySQL).
 *
 * Internal queries are written once in `@name` form so the SQL Server text needs
 * no edits; every other driver converts on the way out. The scanner skips string
 * literals, comments and quoted identifiers so an `@` inside them is left alone.
 *
 * A name repeated in the SQL is emitted once per occurrence, which is what both
 * positional protocols require.
 */
export function toPositional(
  sql: string,
  params: QueryParams | undefined,
  placeholder: (index: number) => string
): PositionalQuery {
  if (!params || Object.keys(params).length === 0) return { sql, values: [] };

  const values: unknown[] = [];
  let out = "";
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Line comment
    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // Block comment
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // Quoted regions: '' escapes inside single quotes, "" inside double quotes,
    // `` inside backticks, ]] inside brackets.
    if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
      const close = ch === "[" ? "]" : ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === close) {
          if (sql[j + 1] === close) {
            j += 2; // escaped closing delimiter
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    // Named parameter
    if (ch === "@" && /[A-Za-z_]/.test(next ?? "")) {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j += 1;
      const name = sql.slice(i + 1, j);

      if (Object.prototype.hasOwnProperty.call(params, name)) {
        values.push(params[name].value);
        out += placeholder(values.length);
        i = j;
        continue;
      }

      // Not one of ours — emit untouched.
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    out += ch;
    i += 1;
  }

  return { sql: out, values };
}

/** Postgres `$1`-style placeholders. */
export function toPostgres(sql: string, params?: QueryParams): PositionalQuery {
  return toPositional(sql, params, (n) => `$${n}`);
}

/** MySQL `?`-style placeholders. */
export function toMySql(sql: string, params?: QueryParams): PositionalQuery {
  return toPositional(sql, params, () => "?");
}
