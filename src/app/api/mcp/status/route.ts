import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { disableMcp, enableMcp, getMcpState, setAllowedForSession, setRequireApproval } from "@/lib/mcp/state";
import { approveAll, denyAll, listPending } from "@/lib/mcp/approvals";
import { getMcpPrefs, setMcpPrefs } from "@/lib/editor-db";

export const dynamic = "force-dynamic";

function endpoint(req: NextRequest): string {
  return `${new URL(req.url).origin}/api/mcp`;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.connected || !session.sessionId) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }
  let state = getMcpState(session.sessionId);
  // State created before tokens were persisted (e.g. kept across a dev hot reload) has no token; adopt one.
  if (state && !state.token) {
    enableMcp(session.sessionId, {
      serverName: session.serverName ?? "",
      databaseName: session.databaseName ?? "",
    });
    state = getMcpState(session.sessionId);
  }
  return NextResponse.json({
    enabled: Boolean(state),
    requireApproval: state?.requireApproval ?? true,
    allowedForSession: state?.allowedForSession ?? false,
    url: endpoint(req),
    pending: state ? listPending(session.sessionId) : [],
    token: state?.token,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.connected || !session.sessionId) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    requireApproval?: boolean;
    allowedForSession?: boolean;
    refreshToken?: boolean;
  };
  const sid = session.sessionId;

  if (body.enabled === true || (body.refreshToken === true && getMcpState(sid))) {
    // The token is persistent; it only changes when the user asks to refresh it.
    enableMcp(sid, {
      rotate: body.refreshToken === true,
      serverName: session.serverName ?? "",
      databaseName: session.databaseName ?? "",
      requireApproval: body.requireApproval,
    });
  } else if (body.enabled === false) {
    denyAll(sid);
    disableMcp(sid);
  } else {
    if (typeof body.requireApproval === "boolean") setRequireApproval(sid, body.requireApproval);
    if (typeof body.allowedForSession === "boolean") setAllowedForSession(sid, body.allowedForSession);
    // Switching to auto-accept releases anything already waiting.
    if (body.requireApproval === false) approveAll(sid);
  }

  const state = getMcpState(sid);
  // Remember on/off and the approval mode so the next connect to this database restores them.
  // "Allow for this session" is deliberately not remembered.
  if (typeof body.enabled === "boolean" || typeof body.requireApproval === "boolean") {
    const serverName = session.serverName ?? "";
    const databaseName = session.databaseName ?? "";
    setMcpPrefs(serverName, databaseName, {
      enabled: Boolean(state),
      requireApproval:
        state?.requireApproval ?? body.requireApproval ?? getMcpPrefs(serverName, databaseName)?.requireApproval ?? true,
    });
  }
  return NextResponse.json({
    enabled: Boolean(state),
    requireApproval: state?.requireApproval ?? true,
    allowedForSession: state?.allowedForSession ?? false,
    url: endpoint(req),
    pending: state ? listPending(sid) : [],
    token: state?.token,
  });
}
