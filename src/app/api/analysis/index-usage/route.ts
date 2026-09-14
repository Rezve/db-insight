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
    if (!table?.includes(".")) {
      return NextResponse.json({ error: "table parameter required (schema.name)" }, { status: 400 });
    }

    const [schema, tableName] = table.split(".", 2);

    const driver = getSessionDriver(session.sessionId);

    // These read server-level views the user may not have rights to (SQL Server
    // DMVs need VIEW SERVER STATE, MySQL's performance_schema is often
    // restricted). Report no usage data rather than failing the panel.
    const optional = <T>(p: Promise<T[]>): Promise<T[]> => p.catch(() => [] as T[]);

    const [startTimeRows, rows] = await Promise.all([
      optional(runIntrospection<{ serverStartTime: Date | string | null }>(
        session.sessionId,
        driver.introspection.serverStartTime()
      )),
      optional(runIntrospection<{
      indexName: string | null;
      indexId: number;
      userSeeks: number;
      userScans: number;
      userLookups: number;
      userUpdates: number;
      lastUserSeek: Date | string | null;
      lastUserScan: Date | string | null;
      lastUserLookup: Date | string | null;
      sizeGB: number | null;
    }>(session.sessionId, driver.introspection.indexUsage(schema, tableName))),
    ]);

    // Engines differ on whether timestamps arrive as Date or as strings.
    const asIso = (value: Date | string | null | undefined): string | null => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      return isNaN(date.getTime()) ? null : date.toISOString();
    };

    const usageStats = rows.map((row) => ({
      indexName: row.indexName ?? "(Heap)",
      indexId: Number(row.indexId),
      userSeeks: Number(row.userSeeks),
      userScans: Number(row.userScans),
      userLookups: Number(row.userLookups),
      userUpdates: Number(row.userUpdates),
      lastUserSeek: asIso(row.lastUserSeek),
      lastUserScan: asIso(row.lastUserScan),
      lastUserLookup: asIso(row.lastUserLookup),
      sizeGB: row.sizeGB == null ? null : Number(row.sizeGB),
    }));

    const serverStartTime = asIso(startTimeRows[0]?.serverStartTime);

    return NextResponse.json({ tableName: table, serverStartTime, usageStats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
