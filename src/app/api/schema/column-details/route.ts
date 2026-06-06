import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { SQL_EXTENDED_COLUMN_DETAILS } from "@/lib/sql-queries";
import type { ExtendedColumnDetail } from "@/types/analysis";
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

    const rows = await executeQuery<{
      columnName: string;
      isComputed: boolean;
      computedDefinition: string | null;
      isPersisted: boolean | null;
      isSparse: boolean;
      identitySeed: string | null;
      identityIncrement: string | null;
      collationName: string | null;
      columnComment: string | null;
      defaultConstraintName: string | null;
      defaultDefinition: string | null;
    }>(session.sessionId, SQL_EXTENDED_COLUMN_DETAILS, {
      schema: { type: sql.NVarChar(128), value: schema },
      tableName: { type: sql.NVarChar(128), value: tableName },
    });

    const columnDetails: ExtendedColumnDetail[] = rows.map((r) => ({
      columnName: r.columnName,
      isComputed: Boolean(r.isComputed),
      computedDefinition: r.computedDefinition ?? null,
      isPersisted: r.isPersisted != null ? Boolean(r.isPersisted) : null,
      isSparse: Boolean(r.isSparse),
      identitySeed: r.identitySeed != null ? Number(r.identitySeed) : null,
      identityIncrement: r.identityIncrement != null ? Number(r.identityIncrement) : null,
      collationName: r.collationName ?? null,
      columnComment: r.columnComment ?? null,
      defaultConstraintName: r.defaultConstraintName ?? null,
      defaultDefinition: r.defaultDefinition ?? null,
    }));

    return NextResponse.json({ tableName: table, columnDetails });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
