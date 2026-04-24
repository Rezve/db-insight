import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOrCreatePool } from "@/lib/session-store";
import sql from "mssql";

interface UpdateEntry {
  where: Record<string, unknown>;
  set: Record<string, unknown>;
}

function quoteId(name: string) {
  return `[${name.replace(/\]/g, "]]")}]`;
}

// Accepts "schema.table" or "[schema].[table]" — rejects anything else
function parseTable(raw: string): { schema: string; table: string } | null {
  const clean = raw.replace(/[\[\]]/g, "");
  const parts = clean.split(".");
  if (parts.length !== 2) return null;
  const [schema, table] = parts;
  if (!/^\w+$/.test(schema) || !/^\w+$/.test(table)) return null;
  return { schema, table };
}

function bindValue(
  request: InstanceType<typeof sql.Request>,
  paramName: string,
  value: unknown
) {
  if (value === null || value === undefined) {
    request.input(paramName, sql.NVarChar(sql.MAX), null);
  } else {
    request.input(paramName, sql.NVarChar(sql.MAX), String(value));
  }
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

    const pool = await getOrCreatePool(session.sessionId);
    const rowsAffected: number[] = [];

    for (const update of updates) {
      const setCols = Object.keys(update.set);
      const whereCols = Object.keys(update.where);

      if (setCols.length === 0 || whereCols.length === 0) continue;

      const request = pool.request();

      const setClause = setCols
        .map((col, i) => {
          const p = `s${i}`;
          bindValue(request, p, update.set[col]);
          return `${quoteId(col)} = @${p}`;
        })
        .join(", ");

      const whereClause = whereCols
        .map((col, i) => {
          const p = `w${i}`;
          bindValue(request, p, update.where[col]);
          return `${quoteId(col)} = @${p}`;
        })
        .join(" AND ");

      const querySql = `UPDATE ${quoteId(parsed.schema)}.${quoteId(parsed.table)} SET ${setClause} WHERE ${whereClause}`;
      const result = await request.query(querySql);
      rowsAffected.push(result.rowsAffected[0] ?? 0);
    }

    return NextResponse.json({ rowsAffected });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
