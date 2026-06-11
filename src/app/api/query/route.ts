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
    const { sql, maxRows = 1000, planMode = "off" } = body as {
      sql: string;
      maxRows?: number;
      planMode?: "off" | "actual" | "estimated";
    };

    if (!sql || typeof sql !== "string") {
      return NextResponse.json({ error: "sql is required" }, { status: 400 });
    }

    const pool = await getOrCreatePool(session.sessionId);
    const start = Date.now();

    const statistics: string[] = [];

    function extractPlanXml(row: Record<string, unknown>): string | undefined {
      const key = Object.keys(row).find(
        (k) => k.toLowerCase().includes("showplan") || k.toLowerCase().includes("xml")
      );
      return key && typeof row[key] === "string" ? (row[key] as string) : undefined;
    }

    // Estimated plan: SET SHOWPLAN_XML must be the only statement in its batch,
    // so we make three sequential requests on the same pool connection.
    if (planMode === "estimated") {
      try {
        await pool.request().query("SET SHOWPLAN_XML ON");

        const planRequest = pool.request();
        planRequest.on("info", (info: { message: string }) => {
          if (info.message?.trim()) statistics.push(info.message);
        });
        const planResult = await planRequest.query(sql);
        const executionMs = Date.now() - start;

        await pool.request().query("SET SHOWPLAN_XML OFF");

        const allRecordsets = Array.isArray(planResult.recordsets)
          ? (planResult.recordsets as Record<string, unknown>[][])
          : [];

        let planXml: string | undefined;
        for (const rs of allRecordsets) {
          if (rs?.length >= 1) {
            planXml = extractPlanXml(rs[0] as Record<string, unknown>);
            if (planXml) break;
          }
        }

        const durationMs = Date.now() - start;
        const fetchingMs = durationMs - executionMs;

        return NextResponse.json({
          columns: [],
          rows: [],
          rowCount: 0,
          durationMs,
          executionMs,
          fetchingMs,
          truncated: false,
          rowsAffected: [],
          statistics,
          planXml,
        });
      } catch (queryErr) {
        // Always turn SHOWPLAN_XML back off so the connection is reusable
        try { await pool.request().query("SET SHOWPLAN_XML OFF"); } catch {}
        const durationMs = Date.now() - start;
        const err = queryErr as Error & { lineNumber?: number };
        return NextResponse.json(
          { error: err.message, lineNumber: err.lineNumber, durationMs, executionMs: durationMs, fetchingMs: 0, statistics },
          { status: 400 }
        );
      }
    }

    try {
      const request = pool.request();
      request.on("info", (info: { message: string }) => {
        if (info.message?.trim()) statistics.push(info.message);
      });
      const result = await request.query(sql);
      const executionMs = Date.now() - start;

      // mssql recordsets typed as array — cast for safe indexing
      const allRecordsets = Array.isArray(result.recordsets)
        ? (result.recordsets as Record<string, unknown>[][])
        : [];

      const isActualPlan = planMode === "actual";

      // Actual plan: data in recordsets[0], plan XML in last recordset.
      const firstRecordset: Record<string, unknown>[] =
        isActualPlan && allRecordsets.length > 0
          ? allRecordsets[0]
          : (result.recordset as Record<string, unknown>[]) ?? [];

      const recordset = firstRecordset || [];
      const truncated = recordset.length > maxRows;
      const rows = truncated ? recordset.slice(0, maxRows) : recordset;

      const columns = result.recordset?.columns
        ? Object.entries(result.recordset.columns).map(([name, meta]) => ({
            name,
            dataType:
              (meta as { type?: { declaration?: string } }).type
                ?.declaration ?? "unknown",
          }))
        : rows.length > 0
        ? Object.keys(rows[0]).map((name) => ({ name, dataType: "unknown" }))
        : [];

      let planXml: string | undefined;
      if (isActualPlan && allRecordsets.length > 1) {
        const lastRecordset = allRecordsets[allRecordsets.length - 1];
        if (lastRecordset?.length === 1) {
          planXml = extractPlanXml(lastRecordset[0] as Record<string, unknown>);
        }
      }

      const durationMs = Date.now() - start;
      const fetchingMs = durationMs - executionMs;

      return NextResponse.json({
        columns,
        rows,
        rowCount: recordset.length,
        durationMs,
        executionMs,
        fetchingMs,
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
          executionMs: durationMs,
          fetchingMs: 0,
          statistics,
        },
        { status: 400 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
