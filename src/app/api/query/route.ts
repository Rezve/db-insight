import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOrCreatePool } from "@/lib/session-store";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.connected || !session.sessionId) {
      return NextResponse.json({ error: "Not connected" }, { status: 401 });
    }

    const body = await req.json();
    const { sql, maxRows = 1000 } = body as { sql: string; maxRows?: number };

    if (!sql || typeof sql !== "string") {
      return NextResponse.json({ error: "sql is required" }, { status: 400 });
    }

    const pool = await getOrCreatePool(session.sessionId);
    const start = Date.now();

    try {
      const request = pool.request();
      const result = await request.query(sql);
      const durationMs = Date.now() - start;

      const recordset = result.recordset || [];
      const truncated = recordset.length > maxRows;
      const rows = truncated ? recordset.slice(0, maxRows) : recordset;

      // Infer column names from first row or recordset columns
      const columns =
        result.recordset?.columns
          ? Object.entries(result.recordset.columns).map(([name, meta]) => ({
              name,
              dataType: (meta as { type?: { declaration?: string } }).type?.declaration ?? "unknown",
            }))
          : rows.length > 0
          ? Object.keys(rows[0]).map((name) => ({ name, dataType: "unknown" }))
          : [];

      return NextResponse.json({
        columns,
        rows,
        rowCount: recordset.length,
        durationMs,
        truncated,
        rowsAffected: result.rowsAffected,
      });
    } catch (queryErr) {
      const durationMs = Date.now() - start;
      const err = queryErr as Error & { lineNumber?: number };
      return NextResponse.json(
        {
          error: err.message,
          lineNumber: err.lineNumber,
          durationMs,
        },
        { status: 400 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
