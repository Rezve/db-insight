import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSessionDriver, runIntrospection } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const schema = searchParams.get("schema");
  const name = searchParams.get("name");

  if (!schema || !name) {
    return NextResponse.json({ error: "schema and name are required" }, { status: 400 });
  }

  const session = await getSession();
  if (!session.connected || !session.sessionId) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  try {
    const driver = getSessionDriver(session.sessionId);
    const rows = await runIntrospection<{ definition: string }>(
      session.sessionId,
      driver.introspection.spDefinition(schema, name)
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Stored procedure not found" }, { status: 404 });
    }

    return NextResponse.json({ definition: rows[0].definition });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
