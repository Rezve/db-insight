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
    const { sql, maxRows = 1000, planEnabled = false } = body as {
      sql: string;
      maxRows?: number;
      planEnabled?: boolean;
    };

    if (!sql || typeof sql !== "string") {
      return NextResponse.json({ error: "sql is required" }, { status: 400 });
    }

    const pool = await getOrCreatePool(session.sessionId);
    const start = Date.now();

    const statistics: string[] = [];

    try {
      const request = pool.request();
      request.on("info", (info: { message: string }) => {
        if (info.message?.trim()) statistics.push(info.message);
      });
      const result = await request.query(sql);
      const durationMs = Date.now() - start;

      // mssql recordsets typed as array — cast for safe indexing
      const allRecordsets = Array.isArray(result.recordsets)
        ? (result.recordsets as Record<string, unknown>[][])
        : [];

      // When planEnabled, actual query results are in recordsets[0]; plan XML is in the last.
      const firstRecordset: Record<string, unknown>[] =
        planEnabled && allRecordsets.length > 0
          ? allRecordsets[0]
          : (result.recordset as Record<string, unknown>[]) ?? [];

      const recordset = firstRecordset || [];
      const truncated = recordset.length > maxRows;
      const rows = truncated ? recordset.slice(0, maxRows) : recordset;

      // Infer column names from first recordset's columns metadata
      const columns =
        result.recordset?.columns
          ? Object.entries(result.recordset.columns).map(([name, meta]) => ({
              name,
              dataType:
                (meta as { type?: { declaration?: string } }).type
                  ?.declaration ?? "unknown",
            }))
          : rows.length > 0
          ? Object.keys(rows[0]).map((name) => ({ name, dataType: "unknown" }))
          : [];

      // Extract plan XML from last recordset when plan is enabled
      let planXml: string | undefined;
      if (planEnabled && allRecordsets.length > 1) {
        const lastRecordset = allRecordsets[allRecordsets.length - 1];
        if (lastRecordset?.length === 1) {
          const planRow = lastRecordset[0] as Record<string, unknown>;
          const planKey = Object.keys(planRow).find(
            (k) =>
              k.toLowerCase().includes("showplan") ||
              k.toLowerCase().includes("xml")
          );
          if (planKey && typeof planRow[planKey] === "string") {
            planXml = planRow[planKey] as string;
          }
        }
      }

      return NextResponse.json({
        columns,
        rows,
        rowCount: recordset.length,
        durationMs,
        truncated,
        rowsAffected: result.rowsAffected,
        statistics,
        planXml,
      });
    } catch (queryErr) {
      const durationMs = Date.now() - start;
      const err = queryErr as Error & { lineNumber?: number };
      return NextResponse.json(
        {
          error: err.message,
          lineNumber: err.lineNumber,
          durationMs,
          statistics,
        },
        { status: 400 }
      );
    } finally {
      // request is local — no listener cleanup needed
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
