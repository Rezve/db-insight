import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { clearMcpAudit, listMcpAudit } from "@/lib/editor-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session.connected || !session.sessionId) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }
  const entries = listMcpAudit(session.serverName ?? "", session.databaseName ?? "", 100);
  return NextResponse.json({ entries });
}

export async function DELETE() {
  const session = await getSession();
  if (!session.connected || !session.sessionId) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }
  clearMcpAudit(session.serverName ?? "", session.databaseName ?? "");
  return NextResponse.json({ ok: true });
}
