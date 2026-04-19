import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSnapshots } from "@/lib/stats-db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.connected || !session.sessionId) {
      return NextResponse.json({ error: "Not connected" }, { status: 401 });
    }

    const databaseName = session.databaseName ?? "";
    if (!databaseName) {
      return NextResponse.json({ error: "No database context in session" }, { status: 400 });
    }

    const snapshots = getSnapshots(databaseName, 90);

    // Use the canonical server name from stored snapshots if available,
    // otherwise fall back to the session value (user-entered at login)
    const serverName = snapshots[0]?.server_name ?? session.serverName ?? "";

    return NextResponse.json({ serverName, databaseName, snapshots });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
