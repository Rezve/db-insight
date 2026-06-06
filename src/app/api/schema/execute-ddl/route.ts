import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeRawQuery } from "@/lib/db";

const ALLOWED_PREFIXES = [
  "ALTER TABLE ",
  "DROP INDEX ",
  "ALTER INDEX ",
  "EXEC SYS.SP_ADDEXTENDEDPROPERTY",
  "EXEC SYS.SP_UPDATEEXTENDEDPROPERTY",
  "EXEC SP_RENAME ",
];

function isAllowedDDL(sql: string): boolean {
  const lines = sql.split("\n").filter((l) => l.trim().length > 0);
  return lines.every((line) => {
    const upper = line.trimStart().toUpperCase();
    return ALLOWED_PREFIXES.some((p) => upper.startsWith(p));
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.connected || !session.sessionId) {
      return NextResponse.json({ error: "Not connected" }, { status: 401 });
    }

    const body = await req.json();
    const { sql } = body as { sql: unknown };

    if (typeof sql !== "string" || !sql.trim()) {
      return NextResponse.json({ error: "sql is required" }, { status: 400 });
    }

    if (!isAllowedDDL(sql)) {
      return NextResponse.json({ error: "Disallowed DDL statement" }, { status: 400 });
    }

    const result = await executeRawQuery(session.sessionId, sql);
    return NextResponse.json({ success: true, rowsAffected: result.rowsAffected });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
