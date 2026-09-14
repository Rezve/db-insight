import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSessionDriver, runIntrospection } from "@/lib/db";

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

    // Fast metadata count first
    const fastRows = await runIntrospection<{ rowCount: number }>(
      session.sessionId,
      driver.introspection.rowCountFast(schema, tableName)
    );

    const fastCount = fastRows[0]?.rowCount;

    // Fall back to an exact count if metadata returns nothing (view, or no stats yet)
    if (!fastCount && fastCount !== 0) {
      const exactRows = await runIntrospection<{ rowCount: number | bigint }>(
        session.sessionId,
        driver.introspection.rowCountExact(schema, tableName)
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
