import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOrCreatePool } from "@/lib/session-store";
import { getSessionDriver } from "@/lib/db";
import type { QueryParams } from "@/lib/db/types";

interface UpdateEntry {
  where: Record<string, unknown>;
  set: Record<string, unknown>;
}

// Accepts "schema.table" or a quoted equivalent — rejects anything else
function parseTable(raw: string): { schema: string; table: string } | null {
  const clean = raw.replace(/[[\]`"]/g, "");
  const parts = clean.split(".");
  if (parts.length !== 2) return null;
  const [schema, table] = parts;
  if (!/^\w+$/.test(schema) || !/^\w+$/.test(table)) return null;
  return { schema, table };
}

/**
 * Grid edits arrive as text, so values bind as strings and the engine converts
 * them to the column's type: SQL Server by implicit conversion, Postgres by
 * inferring an untyped parameter from its context, MySQL by coercion.
 *
 * Booleans are the exception and must stay native — MySQL rejects the string
 * "true" outright for a TINYINT column, while each driver renders a real
 * boolean correctly (1/0 for MySQL, true/false for Postgres, BIT for SQL
 * Server). Null stays null so it does not become the literal string "null".
 */
function bindValue(value: unknown): QueryParams[string] {
  if (value === null || value === undefined) return { value: null };
  if (typeof value === "boolean") return { value, type: "boolean" };
  return { value: String(value), type: "string" };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.connected || !session.sessionId) {
      return NextResponse.json({ error: "Not connected" }, { status: 401 });
    }

    const body = await req.json();
    const { table, updates } = body as { table: string; updates: UpdateEntry[] };

    if (!table || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: "table and updates are required" }, { status: 400 });
    }

    const parsed = parseTable(table);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
    }

    const driver = getSessionDriver(session.sessionId);
    const pool = await getOrCreatePool(session.sessionId);
    const { quoteId } = driver;

    const target = parsed.schema
      ? `${quoteId(parsed.schema)}.${quoteId(parsed.table)}`
      : quoteId(parsed.table);

    const results = await Promise.all(
      updates
        .filter((u) => Object.keys(u.set).length > 0 && Object.keys(u.where).length > 0)
        .map((update) => {
          const params: QueryParams = {};

          const setClause = Object.keys(update.set)
            .map((col, i) => {
              const p = `s${i}`;
              params[p] = bindValue(update.set[col]);
              return `${quoteId(col)} = @${p}`;
            })
            .join(", ");

          const whereClause = Object.keys(update.where)
            .map((col, i) => {
              const p = `w${i}`;
              params[p] = bindValue(update.where[col]);
              return `${quoteId(col)} = @${p}`;
            })
            .join(" AND ");

          const querySql = `UPDATE ${target} SET ${setClause} WHERE ${whereClause}`;
          return driver.query(pool, querySql, params);
        })
    );
    const rowsAffected = results.map((r) => r.rowsAffected[0] ?? 0);

    return NextResponse.json({ rowsAffected });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
