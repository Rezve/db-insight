import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import sql from "mssql";

const SQL_TABLE_SIZE = `
SELECT
    CAST(
        ROUND(SUM(ps.reserved_page_count) * 8192.0 / (1024.0 * 1024.0 * 1024.0), 4)
    AS DECIMAL(18, 4)) AS [sizeGB]
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN sys.dm_db_partition_stats ps ON t.object_id = ps.object_id
WHERE s.name = @schema
  AND t.name = @tableName
`;

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

    const rows = await executeQuery<{ sizeGB: number }>(
      session.sessionId,
      SQL_TABLE_SIZE,
      {
        schema: { type: sql.NVarChar(128), value: schema },
        tableName: { type: sql.NVarChar(128), value: tableName },
      }
    );

    const sizeGB = rows[0]?.sizeGB != null ? Number(rows[0].sizeGB) : null;
    return NextResponse.json({ sizeGB });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
