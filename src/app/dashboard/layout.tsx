import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSetupComplete } from "@/lib/config";
import { executeQuery } from "@/lib/db";
import { SQL_LIST_TABLES, SQL_LIST_STORED_PROCEDURES } from "@/lib/sql-queries";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import SidebarSkeleton from "@/components/dashboard/SidebarSkeleton";
import { SessionCacheProvider } from "@/contexts/session-cache-context";
import { SchemaProvider } from "@/contexts/schema-context";
import { UpdateProvider } from "@/contexts/update-context";
import { EditorThemeProvider } from "@/contexts/editor-theme-context";
import type { TableInfo, StoredProcedureInfo } from "@/types/db";

async function SidebarLoader({ sessionId }: { sessionId: string }) {
  let tables: TableInfo[] = [];
  let storedProcedures: StoredProcedureInfo[] = [];

  try {
    const [tableRows, spRows] = await Promise.all([
      executeQuery<{ schema: string; name: string; type: string }>(sessionId, SQL_LIST_TABLES),
      executeQuery<{ schema: string; name: string }>(sessionId, SQL_LIST_STORED_PROCEDURES),
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
    // Render empty sidebar if DB queries fail
  }

  return <Sidebar tables={tables} storedProcedures={storedProcedures} />;
}

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

  return (
    <UpdateProvider>
    <SessionCacheProvider>
      <SchemaProvider>
        <EditorThemeProvider>
          <div className="flex h-screen flex-col overflow-hidden">
            <Header
              serverName={session.serverName ?? "Unknown server"}
              databaseName={session.databaseName ?? "Unknown database"}
            />
            <div className="flex flex-1 overflow-hidden">
              <Suspense fallback={<SidebarSkeleton />}>
                <SidebarLoader sessionId={session.sessionId} />
              </Suspense>
              <main className="flex-1 overflow-auto bg-background">{children}</main>
            </div>
          </div>
        </EditorThemeProvider>
      </SchemaProvider>
    </SessionCacheProvider>
    </UpdateProvider>
  );
}
