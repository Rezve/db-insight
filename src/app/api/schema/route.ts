import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { SQL_SCHEMA_COLUMNS, SQL_SCHEMA_ROUTINES } from "@/lib/sql-queries";
import type { SchemaData, SchemaTable, SchemaRoutine } from "@/types/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.connected || !session.sessionId) {
      return NextResponse.json({ error: "Not connected" }, { status: 401 });
    }

    const [colRows, routineRows] = await Promise.all([
      executeQuery<{
        tableSchema: string;
        tableName: string;
        columnName: string;
        dataType: string;
        isNullable: string;
        maxLength: number | null;
      }>(session.sessionId, SQL_SCHEMA_COLUMNS),
      executeQuery<{ schema: string; name: string; type: string }>(
        session.sessionId,
        SQL_SCHEMA_ROUTINES
      ),
    ]);

    // Group columns by table
    const tableMap = new Map<string, SchemaTable>();
    for (const row of colRows) {
      const key = `${row.tableSchema}.${row.tableName}`;
      if (!tableMap.has(key)) {
        tableMap.set(key, { schema: row.tableSchema, name: row.tableName, columns: [] });
      }
      tableMap.get(key)!.columns.push({
        name: row.columnName,
        dataType: row.dataType,
        isNullable: row.isNullable === "YES",
        maxLength: row.maxLength,
      });
    }

    const data: SchemaData = {
      tables: Array.from(tableMap.values()),
      storedProcedures: routineRows
        .filter((r) => r.type === "PROCEDURE")
        .map((r) => ({ schema: r.schema, name: r.name, type: "PROCEDURE" as const })),
      functions: routineRows
        .filter((r) => r.type === "FUNCTION")
        .map((r) => ({ schema: r.schema, name: r.name, type: "FUNCTION" as const })) as SchemaRoutine[],
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
