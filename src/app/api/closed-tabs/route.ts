import { NextRequest, NextResponse } from "next/server";
import { getClosedTabs, addClosedTab, deleteClosedTab } from "@/lib/editor-db";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    const serverName = session.serverName ?? "";
    const databaseName = session.databaseName ?? "";
    const closedTabs = getClosedTabs(serverName, databaseName);
    return NextResponse.json({ closedTabs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const serverName = session.serverName ?? "";
    const databaseName = session.databaseName ?? "";
    const body = (await req.json()) as { id: string; name: string; sql: string };
    addClosedTab(body, serverName, databaseName);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    const serverName = session.serverName ?? "";
    const databaseName = session.databaseName ?? "";
    const body = (await req.json()) as { id: string; closedAt: string };
    deleteClosedTab(body.id, body.closedAt, serverName, databaseName);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
