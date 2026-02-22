import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { SQL_INDEX_INFO } from "@/lib/sql-queries";
import type { IndexInfo } from "@/types/analysis";
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
      type: string;
      isUnique: boolean;
      isPrimaryKey: boolean;
      isDisabled: boolean;
      filterDefinition: string | null;
      columnName: string | null;
      isIncluded: boolean;
      keyOrdinal: number;
    }>(session.sessionId, SQL_INDEX_INFO, {
      schema: { type: sql.NVarChar(128), value: schema },
      tableName: { type: sql.NVarChar(128), value: tableName },
    });

    // Group columns by index
    const indexMap = new Map<number, IndexInfo>();
    for (const row of rows) {
      if (!indexMap.has(row.indexId)) {
        indexMap.set(row.indexId, {
          indexName: row.indexName ?? `(Heap)`,
          indexId: row.indexId,
          type: row.type,
          isUnique: Boolean(row.isUnique),
          isPrimaryKey: Boolean(row.isPrimaryKey),
          isDisabled: Boolean(row.isDisabled),
          filterDefinition: row.filterDefinition,
          columns: [],
        });
      }
      if (row.columnName) {
        indexMap.get(row.indexId)!.columns.push({
          name: row.columnName,
          isIncluded: Boolean(row.isIncluded),
          keyOrdinal: row.keyOrdinal,
        });
      }
    }

    return NextResponse.json({ tableName: table, indexes: Array.from(indexMap.values()) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
