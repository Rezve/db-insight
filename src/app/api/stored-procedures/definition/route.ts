import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { SQL_GET_SP_DEFINITION } from "@/lib/sql-queries";
import sql from "mssql";

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
    const rows = await executeQuery<{ definition: string }>(
      session.sessionId,
      SQL_GET_SP_DEFINITION,
      {
        schema: { type: sql.NVarChar(128), value: schema },
        name: { type: sql.NVarChar(128), value: name },
      }
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
