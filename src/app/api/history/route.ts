import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSnapshots, getLatestSnapshot } from "@/lib/stats-db";
import { executeQuery } from "@/lib/db";
import { SQL_SUMMARY_SERVER_INFO } from "@/lib/sql-queries";

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

    // Get the canonical server name from SQL Server (@@SERVERNAME)
    // This ensures we match the server name used when snapshots were saved
    let serverName = session.serverName ?? "";
    try {
      const srvRows = await executeQuery<{ serverName: string }>(sid, SQL_SUMMARY_SERVER_INFO);
      if (srvRows?.[0]?.serverName) {
        serverName = srvRows[0].serverName;
      }
    } catch {
      // Fall back to session value if query fails
    }

    const snapshots = getSnapshots(databaseName, serverName, 90);

    return NextResponse.json({ serverName, databaseName, snapshots });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
