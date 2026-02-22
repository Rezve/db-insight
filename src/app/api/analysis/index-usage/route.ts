import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { SQL_INDEX_USAGE } from "@/lib/sql-queries";
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

    const rows = await executeQuery<{
      indexName: string | null;
      indexId: number;
      userSeeks: number;
      userScans: number;
      userLookups: number;
      userUpdates: number;
      lastUserSeek: Date | null;
      lastUserScan: Date | null;
      lastUserLookup: Date | null;
    }>(session.sessionId, SQL_INDEX_USAGE, {
      schema: { type: sql.NVarChar(128), value: schema },
      tableName: { type: sql.NVarChar(128), value: tableName },
    });

    const usageStats = rows.map((row) => ({
      indexName: row.indexName ?? "(Heap)",
      indexId: row.indexId,
      userSeeks: Number(row.userSeeks),
      userScans: Number(row.userScans),
      userLookups: Number(row.userLookups),
      userUpdates: Number(row.userUpdates),
      lastUserSeek: row.lastUserSeek ? row.lastUserSeek.toISOString() : null,
      lastUserScan: row.lastUserScan ? row.lastUserScan.toISOString() : null,
      lastUserLookup: row.lastUserLookup ? row.lastUserLookup.toISOString() : null,
    }));

    return NextResponse.json({ tableName: table, usageStats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
