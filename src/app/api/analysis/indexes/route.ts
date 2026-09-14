import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSessionDriver, runIntrospection } from "@/lib/db";
import type { IndexInfo } from "@/types/analysis";

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

    const [rows, sizeRows] = await Promise.all([
      runIntrospection<{
        indexName: string | null;
        indexId: number;
        type: string;
        isUnique: boolean;
        isPrimaryKey: boolean;
        isDisabled: boolean;
        filterDefinition: string | null;
        columnName: string | null;
        isIncluded: boolean;
        keyOrdinal: number;
      }>(session.sessionId, driver.introspection.indexInfo(schema, tableName)),
      runIntrospection<{ indexId: number; sizeGB: number | null }>(
        session.sessionId,
        driver.introspection.indexSizes(schema, tableName)
      ),
    ]);

    // Engines without per-index storage figures (MySQL) report null here.
    const sizeMap = new Map<number, number>(
      sizeRows
        .filter((r) => r.sizeGB != null)
        .map((r) => [Number(r.indexId), Number(r.sizeGB)])
    );

    // Group columns by index
    const indexMap = new Map<number, IndexInfo>();
    for (const row of rows) {
      // Postgres returns OIDs as strings; coerce so the key type is consistent.
      const indexId = Number(row.indexId);
      if (!indexMap.has(indexId)) {
        indexMap.set(indexId, {
          indexName: row.indexName ?? `(Heap)`,
          indexId,
          type: row.type,
          isUnique: Boolean(row.isUnique),
          isPrimaryKey: Boolean(row.isPrimaryKey),
          isDisabled: Boolean(row.isDisabled),
          filterDefinition: row.filterDefinition,
          columns: [],
          sizeGB: sizeMap.get(indexId),
        });
      }
      if (row.columnName) {
        indexMap.get(indexId)!.columns.push({
          name: row.columnName,
          isIncluded: Boolean(row.isIncluded),
          keyOrdinal: Number(row.keyOrdinal),
        });
      }
    }

    return NextResponse.json({ tableName: table, indexes: Array.from(indexMap.values()) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
