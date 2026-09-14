import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSnapshots, getLatestSnapshot } from "@/lib/stats-db";
import { getSessionDriver, runIntrospection } from "@/lib/db";
import { scopeKey } from "@/lib/scope-key";

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

    const sid = session.sessionId;

    // Use the engine's canonical server name so this matches what was stored
    // when the snapshot was written.
    let serverName = session.serverName ?? "";
    try {
      const { introspection } = getSessionDriver(sid);
      const srvRows = await runIntrospection<{ serverName: string }>(
        sid,
        introspection.summaryServerInfo()
      );
      if (srvRows?.[0]?.serverName) {
        serverName = srvRows[0].serverName;
      }
    } catch {
      // Fall back to session value if query fails
    }

    const snapshots = getSnapshots(databaseName, scopeKey(session.engine, serverName), 90);

    return NextResponse.json({ serverName, databaseName, snapshots });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
