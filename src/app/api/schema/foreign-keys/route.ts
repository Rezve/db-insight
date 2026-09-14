import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSessionDriver, runIntrospection } from "@/lib/db";
import type { ForeignKeyDetail } from "@/types/analysis";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.connected || !session.sessionId) {
      return NextResponse.json({ error: "Not connected" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const table = searchParams.get("table");
    if (!table || !table.includes(".")) {
      return NextResponse.json(
        { error: "table parameter required (schema.name)" },
        { status: 400 }
      );
    }

    const [schema, tableName] = table.split(".", 2);

    const driver = getSessionDriver(session.sessionId);
    const rows = await runIntrospection<ForeignKeyDetail>(
      session.sessionId,
      driver.introspection.fkDetails(schema, tableName)
    );

    return NextResponse.json({ tableName: table, foreignKeys: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
