import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSessionDriver, runIntrospection } from "@/lib/db";
import type { DatabaseSummary } from "@/types/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.connected || !session.sessionId) {
      return NextResponse.json({ error: "Not connected" }, { status: 401 });
    }

    const sid = session.sessionId;
    const { introspection } = getSessionDriver(sid);

    /**
     * Storage and activity figures come from views the connecting user may not
     * be allowed to read — SQL Server DMVs need VIEW SERVER STATE, and MySQL's
     * performance_schema is often off limits. A missing permission should leave
     * those tiles empty rather than blank the whole dashboard, so each optional
     * query degrades to no rows.
     */
    const optional = <T>(p: Promise<T[]>): Promise<T[]> => p.catch(() => [] as T[]);

    const [objRows, storRows, rowRows, idxHealthRows, idxUsageRows, srvRows] =
      await Promise.all([
        runIntrospection<{
          tableCount: number; viewCount: number; procedureCount: number;
          functionCount: number; totalColumnCount: number;
          tablesWithPK: number; foreignKeyCount: number;
        }>(sid, introspection.summaryObjectCounts()),
        optional(runIntrospection<{
          totalSizeGB: number; dataSizeGB: number; indexSizeGB: number;
          largestTableName: string | null;
        }>(sid, introspection.summaryStorage())),
        optional(runIntrospection<{ totalRows: number }>(sid, introspection.summaryRowCount())),
        optional(runIntrospection<{
          totalIndexes: number; disabledIndexes: number;
          tablesWithMissingIndexes: number; missingIndexCount: number;
        }>(sid, introspection.summaryIndexHealth())),
        optional(runIntrospection<{
          totalSeeks: number; totalScans: number; totalLookups: number;
          totalUpdates: number; unusedIndexCount: number;
        }>(sid, introspection.summaryIndexUsage())),
        optional(runIntrospection<{
          serverName: string; databaseName: string; sqlVersion: string;
          edition: string; serverStartTime: string; uptimeMinutes: number;
        }>(sid, introspection.summaryServerInfo())),
      ]);

    const obj = objRows[0];
    const stor = storRows[0];
    const rows = rowRows[0];
    const idxH = idxHealthRows[0];
    const idxU = idxUsageRows[0];
    const srv = srvRows[0];

    const summary: DatabaseSummary = {
      tableCount:               Number(obj?.tableCount ?? 0),
      viewCount:                Number(obj?.viewCount ?? 0),
      procedureCount:           Number(obj?.procedureCount ?? 0),
      functionCount:            Number(obj?.functionCount ?? 0),
      totalColumnCount:         Number(obj?.totalColumnCount ?? 0),
      tablesWithPK:             Number(obj?.tablesWithPK ?? 0),
      foreignKeyCount:          Number(obj?.foreignKeyCount ?? 0),
      totalSizeGB:              Number(stor?.totalSizeGB ?? 0),
      dataSizeGB:               Number(stor?.dataSizeGB ?? 0),
      indexSizeGB:              Number(stor?.indexSizeGB ?? 0),
      largestTableName:         stor?.largestTableName ?? null,
      totalRows:                Number(rows?.totalRows ?? 0),
      totalIndexes:             Number(idxH?.totalIndexes ?? 0),
      disabledIndexes:          Number(idxH?.disabledIndexes ?? 0),
      tablesWithMissingIndexes: Number(idxH?.tablesWithMissingIndexes ?? 0),
      missingIndexCount:        Number(idxH?.missingIndexCount ?? 0),
      totalSeeks:               Number(idxU?.totalSeeks ?? 0),
      totalScans:               Number(idxU?.totalScans ?? 0),
      totalLookups:             Number(idxU?.totalLookups ?? 0),
      totalUpdates:             Number(idxU?.totalUpdates ?? 0),
      unusedIndexCount:         Number(idxU?.unusedIndexCount ?? 0),
      // Fall back to the session values so history snapshots stay keyed
      // correctly even when the server-info query is not permitted.
      serverName:               srv?.serverName ?? session.serverName ?? "",
      databaseName:             srv?.databaseName ?? session.databaseName ?? "",
      sqlVersion:               String(srv?.sqlVersion ?? ""),
      edition:                  String(srv?.edition ?? ""),
      serverStartTime:          srv?.serverStartTime ?? "",
      uptimeMinutes:            Number(srv?.uptimeMinutes ?? 0),
    };

    // Fire-and-forget snapshot — must not block or break the summary response
    try {
      const { saveSnapshot } = await import("@/lib/stats-db");
      const { scopeKey } = await import("@/lib/scope-key");
      saveSnapshot(scopeKey(session.engine, summary.serverName), summary.databaseName, summary);
    } catch {
      // intentionally swallowed
    }

    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
