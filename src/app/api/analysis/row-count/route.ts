import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { SQL_ROW_COUNT_FAST, buildRowCountExact } from "@/lib/sql-queries";
import sql from "mssql";

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

    // Fast metadata count first
    const fastRows = await executeQuery<{ rowCount: number }>(
      session.sessionId,
      SQL_ROW_COUNT_FAST,
      {
        schema: { type: sql.NVarChar(128), value: schema },
        tableName: { type: sql.NVarChar(128), value: tableName },
      }
    );

    const fastCount = fastRows[0]?.rowCount;

    // Fall back to COUNT_BIG if metadata returns 0 (could be a view or empty)
    if (!fastCount && fastCount !== 0) {
      const exactRows = await executeQuery<{ rowCount: number | bigint }>(
        session.sessionId,
        buildRowCountExact(schema, tableName)
      );
      const rowCount = Number(exactRows[0]?.rowCount ?? 0);
      return NextResponse.json({ rowCount, tableName: table, source: "exact" });
    }

    return NextResponse.json({ rowCount: Number(fastCount), tableName: table, source: "metadata" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
