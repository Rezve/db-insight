import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { SQL_TABLE_COLUMNS } from "@/lib/sql-queries";
import type { TableColumnDetail } from "@/types/analysis";
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
      return NextResponse.json(
        { error: "table parameter required (schema.name)" },
        { status: 400 }
      );
    }

    const [schema, tableName] = table.split(".", 2);

    const params = {
      schema: { type: sql.NVarChar(128), value: schema },
      tableName: { type: sql.NVarChar(128), value: tableName },
    };

    const rows = await executeQuery<{
      ordinal: number;
      columnName: string;
      dataType: string;
      maxLength: number | null;
      numericPrecision: number | null;
      numericScale: number | null;
      isNullable: string;
      columnDefault: string | null;
      isIdentity: boolean;
      isPrimaryKey: boolean;
      fkSchema: string | null;
      fkTable: string | null;
      fkColumn: string | null;
    }>(session.sessionId, SQL_TABLE_COLUMNS, params);

    const columns: TableColumnDetail[] = rows.map((r) => ({
      ordinal: r.ordinal,
      columnName: r.columnName,
      dataType: r.dataType,
      maxLength: r.maxLength,
      numericPrecision: r.numericPrecision,
      numericScale: r.numericScale,
      isNullable: r.isNullable === "YES",
      columnDefault: r.columnDefault,
      isIdentity: Boolean(r.isIdentity),
      isPrimaryKey: Boolean(r.isPrimaryKey),
      fkSchema: r.fkSchema ?? null,
      fkTable: r.fkTable ?? null,
      fkColumn: r.fkColumn ?? null,
    }));

    return NextResponse.json({ tableName: table, columns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
