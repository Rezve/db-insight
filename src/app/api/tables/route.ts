import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { SQL_LIST_TABLES } from "@/lib/sql-queries";
import type { TableInfo } from "@/types/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.connected || !session.sessionId) {
      return NextResponse.json({ error: "Not connected" }, { status: 401 });
    }

    const rows = await executeQuery<{ schema: string; name: string; type: string }>(
      session.sessionId,
      SQL_LIST_TABLES
    );

    const tables: TableInfo[] = rows.map((row) => ({
      schema: row.schema,
      name: row.name,
      fullName: `${row.schema}.${row.name}`,
      type: row.type as "BASE TABLE" | "VIEW",
    }));

    return NextResponse.json({ tables });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
