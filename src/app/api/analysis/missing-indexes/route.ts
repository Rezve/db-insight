import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSessionDriver, runIntrospection } from "@/lib/db";
import type { MissingIndex } from "@/types/analysis";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.connected || !session.sessionId) {
      return NextResponse.json({ error: "Not connected" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const table = searchParams.get("table");
    if (!table || !table.includes(".")) {
      return NextResponse.json({ error: "table parameter required (schema.name)" }, { status: 400 });
    }

    const [schema, tableName] = table.split(".", 2);

    const driver = getSessionDriver(session.sessionId);

    // Only SQL Server has an engine-side missing-index advisor.
    if (!driver.capabilities.missingIndexAdvisor) {
      return NextResponse.json({ tableName: table, suggestions: [], unsupported: true });
    }

    const rows = await runIntrospection<{
      equalityColumns: string | null;
      inequalityColumns: string | null;
      includedColumns: string | null;
      avgTotalCost: number;
      avgUserImpact: number;
      userSeeks: number;
      userScans: number;
      improvementMeasure: number;
    }>(session.sessionId, driver.introspection.missingIndexes(schema, tableName));

    const suggestions: MissingIndex[] = rows.map((row, idx) => ({
      improvementMeasure: Number(row.improvementMeasure),
      avgTotalCost: Number(row.avgTotalCost),
      avgUserImpact: Number(row.avgUserImpact),
      userSeeks: Number(row.userSeeks),
      userScans: Number(row.userScans),
      equalityColumns: row.equalityColumns,
      inequalityColumns: row.inequalityColumns,
      includedColumns: row.includedColumns,
      suggestedDDL: driver.ddl.missingIndex(
        row.equalityColumns,
        row.inequalityColumns,
        row.includedColumns,
        schema,
        tableName,
        idx + 1
      ),
    }));

    return NextResponse.json({ tableName: table, suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
