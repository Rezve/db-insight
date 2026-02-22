import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { clearSession } from "@/lib/session-store";

export async function POST() {
  try {
    const session = await getSession();
    if (session.sessionId) {
      await clearSession(session.sessionId);
    }
    session.destroy();
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
