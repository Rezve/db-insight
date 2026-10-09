import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { setAllowedForSession } from "@/lib/mcp/state";
import { approveAll, decide } from "@/lib/mcp/approvals";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.connected || !session.sessionId) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }
  const { id, approve, allowSession } = (await req.json().catch(() => ({}))) as {
    id?: string;
    approve?: boolean;
    allowSession?: boolean;
  };
  if (!id || typeof approve !== "boolean") {
    return NextResponse.json({ error: "id and approve are required" }, { status: 400 });
  }
  const found = decide(session.sessionId, id, approve);
  if (approve && allowSession) {
    setAllowedForSession(session.sessionId, true);
    approveAll(session.sessionId);
  }
  return NextResponse.json({ ok: found }, { status: found ? 200 : 404 });
}
