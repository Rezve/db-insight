import { NextRequest, NextResponse } from "next/server";
import { loadEditorState, saveEditorState, EditorState } from "@/lib/editor-db";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    const serverName = session.serverName ?? "";
    const databaseName = session.databaseName ?? "";
    const state = loadEditorState(serverName, databaseName);
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    const serverName = session.serverName ?? "";
    const databaseName = session.databaseName ?? "";
    const body = (await req.json()) as EditorState;
    if (!Array.isArray(body.tabs)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    saveEditorState(body, serverName, databaseName);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
