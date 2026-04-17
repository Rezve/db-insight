import { NextRequest, NextResponse } from "next/server";
import { loadEditorState, saveEditorState, EditorState } from "@/lib/editor-db";

export async function GET() {
  try {
    const state = loadEditorState();
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as EditorState;
    if (!Array.isArray(body.tabs)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    saveEditorState(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
