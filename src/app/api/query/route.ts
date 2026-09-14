import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOrCreatePool } from "@/lib/session-store";
import { getSessionDriver } from "@/lib/db";
import type { NeutralResult, PlanMode, PlanResult } from "@/lib/db/types";

/** Finds the plan-XML column in any of a result's record sets. */
function extractPlanXml(result: NeutralResult): string | undefined {
  const sets = result.recordsets?.length ? result.recordsets : [result.rows];
  for (const rs of sets) {
    const row = rs?.[0];
    if (!row) continue;
    const key = Object.keys(row).find(
      (k) => k.toLowerCase().includes("showplan") || k.toLowerCase().includes("xml")
    );
    if (key && typeof row[key] === "string") return row[key] as string;
  }
  return undefined;
}

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
      planMode?: PlanMode;
    };

    if (!sql || typeof sql !== "string") {
      return NextResponse.json({ error: "sql is required" }, { status: 400 });
    }

    const driver = getSessionDriver(session.sessionId);
    const pool = await getOrCreatePool(session.sessionId);
    const start = Date.now();

    const planCapability = driver.capabilities.queryPlan;
    const wantsPlan = planMode !== "off" && planCapability !== false;

    // An estimated plan never runs the statement, so it short-circuits here.
    if (planMode === "estimated" && wantsPlan) {
      try {
        const plan = await driver.explain(pool, sql, "estimated");
        const durationMs = Date.now() - start;
        return NextResponse.json({
          columns: [],
          rows: [],
          rowCount: 0,
          durationMs,
          executionMs: durationMs,
          fetchingMs: 0,
          truncated: false,
          rowsAffected: [],
          statistics: [],
          planXml: plan.planXml,
          planText: plan.planText,
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
            statistics: [],
          },
          { status: 400 }
        );
      }
    }

    try {
      const result = await driver.query(pool, sql);
      const executionMs = Date.now() - start;

      const isActualPlan = planMode === "actual";
      const allRecordsets = result.recordsets ?? [];

      // SQL Server returns the data in the first record set and appends the
      // plan as a trailing one; other engines return a single set.
      const recordset =
        isActualPlan && allRecordsets.length > 0 ? allRecordsets[0] : result.rows;

      const truncated = recordset.length > maxRows;
      const rows = truncated ? recordset.slice(0, maxRows) : recordset;

      const columns =
        result.columns.length > 0
          ? result.columns
          : rows.length > 0
          ? Object.keys(rows[0]).map((name) => ({ name, dataType: "unknown" }))
          : [];

      let planXml: string | undefined;
      let planText: string | undefined;

      if (isActualPlan && wantsPlan) {
        if (planCapability === "showplan-xml") {
          if (allRecordsets.length > 1) {
            const last = allRecordsets[allRecordsets.length - 1];
            if (last?.length === 1) planXml = extractPlanXml({ ...result, rows: last });
          }
        } else {
          // Engines without an inline plan need a second EXPLAIN round trip.
          const plan = await driver
            .explain(pool, sql, "actual")
            .catch((): PlanResult => ({}));
          planText = plan.planText;
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
        statistics: result.messages,
        planXml,
        planText,
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
          statistics: [],
        },
        { status: 400 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
