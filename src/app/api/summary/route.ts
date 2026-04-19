import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import {
  SQL_SUMMARY_OBJECT_COUNTS,
  SQL_SUMMARY_STORAGE,
  SQL_SUMMARY_ROW_COUNT,
  SQL_SUMMARY_INDEX_HEALTH,
  SQL_SUMMARY_INDEX_USAGE,
  SQL_SUMMARY_SERVER_INFO,
} from "@/lib/sql-queries";
import type { DatabaseSummary } from "@/types/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.connected || !session.sessionId) {
      return NextResponse.json({ error: "Not connected" }, { status: 401 });
    }

    const sid = session.sessionId;
    const [objRows, storRows, rowRows, idxHealthRows, idxUsageRows, srvRows] =
      await Promise.all([
        executeQuery<{
          tableCount: number; viewCount: number; procedureCount: number;
          functionCount: number; totalColumnCount: number;
          tablesWithPK: number; foreignKeyCount: number;
        }>(sid, SQL_SUMMARY_OBJECT_COUNTS),
        executeQuery<{
          totalSizeGB: number; dataSizeGB: number; indexSizeGB: number;
          largestTableName: string | null;
        }>(sid, SQL_SUMMARY_STORAGE),
        executeQuery<{ totalRows: number }>(sid, SQL_SUMMARY_ROW_COUNT),
        executeQuery<{
          totalIndexes: number; disabledIndexes: number;
          tablesWithMissingIndexes: number; missingIndexCount: number;
        }>(sid, SQL_SUMMARY_INDEX_HEALTH),
        executeQuery<{
          totalSeeks: number; totalScans: number; totalLookups: number;
          totalUpdates: number; unusedIndexCount: number;
        }>(sid, SQL_SUMMARY_INDEX_USAGE),
        executeQuery<{
          serverName: string; databaseName: string; sqlVersion: string;
          edition: string; serverStartTime: string; uptimeMinutes: number;
        }>(sid, SQL_SUMMARY_SERVER_INFO),
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
      serverName:               srv?.serverName ?? "",
      databaseName:             srv?.databaseName ?? "",
      sqlVersion:               String(srv?.sqlVersion ?? ""),
      edition:                  String(srv?.edition ?? ""),
      serverStartTime:          srv?.serverStartTime ?? "",
      uptimeMinutes:            Number(srv?.uptimeMinutes ?? 0),
    };

    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
