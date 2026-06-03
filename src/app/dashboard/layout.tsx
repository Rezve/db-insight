import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSetupComplete } from "@/lib/config";
import { executeQuery } from "@/lib/db";
import { SQL_LIST_TABLES, SQL_LIST_STORED_PROCEDURES } from "@/lib/sql-queries";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import { SessionCacheProvider } from "@/contexts/session-cache-context";
import type { TableInfo, StoredProcedureInfo } from "@/types/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSetupComplete()) {
    redirect("/setup");
  }

  const session = await getSession();
  if (!session.connected || !session.sessionId) {
    redirect("/connect");
  }

  let tables: TableInfo[] = [];
  let storedProcedures: StoredProcedureInfo[] = [];

  try {
    const [tableRows, spRows] = await Promise.all([
      executeQuery<{ schema: string; name: string; type: string }>(
        session.sessionId!,
        SQL_LIST_TABLES
      ),
      executeQuery<{ schema: string; name: string }>(
        session.sessionId!,
        SQL_LIST_STORED_PROCEDURES
      ),
    ]);

    tables = tableRows.map((row) => ({
      schema: row.schema,
      name: row.name,
      fullName: `${row.schema}.${row.name}`,
      type: row.type as "BASE TABLE" | "VIEW",
    }));

    storedProcedures = spRows.map((row) => ({
      schema: row.schema,
      name: row.name,
      fullName: `${row.schema}.${row.name}`,
    }));
  } catch {
    // If we can't fetch tables/procedures, still render the layout
  }

  return (
    <SessionCacheProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <Header
          serverName={session.serverName ?? "Unknown server"}
          databaseName={session.databaseName ?? "Unknown database"}
        />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar tables={tables} storedProcedures={storedProcedures} />
          <main className="flex-1 overflow-auto bg-background">{children}</main>
        </div>
      </div>
    </SessionCacheProvider>
  );
}
