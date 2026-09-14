import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSetupComplete } from "@/lib/config";
import { getSessionDriver, runIntrospection } from "@/lib/db";
import { getDriver } from "@/lib/db/registry";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import SidebarSkeleton from "@/components/dashboard/SidebarSkeleton";
import { SessionCacheProvider } from "@/contexts/session-cache-context";
import { SchemaProvider } from "@/contexts/schema-context";
import { UpdateProvider } from "@/contexts/update-context";
import { EditorThemeProvider } from "@/contexts/editor-theme-context";
import { EngineProvider, type EngineInfo } from "@/contexts/engine-context";
import type { TableInfo, StoredProcedureInfo } from "@/types/db";

export const dynamic = "force-dynamic";

async function SidebarLoader({ sessionId }: { sessionId: string }) {
  let tables: TableInfo[] = [];
  let storedProcedures: StoredProcedureInfo[] = [];

  try {
    const { introspection } = getSessionDriver(sessionId);
    const [tableRows, spRows] = await Promise.all([
      runIntrospection<{ schema: string; name: string; type: string }>(
        sessionId,
        introspection.listTables()
      ),
      runIntrospection<{ schema: string; name: string }>(
        sessionId,
        introspection.listStoredProcedures()
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

  // Resolved on the server so the UI can gate features from the first render,
  // without the browser ever importing a database driver.
  const driver = getDriver(session.engine ?? "sqlserver");
  const engineInfo: EngineInfo = {
    engine: driver.engine,
    engineLabel: driver.label,
    defaultSchema: driver.defaultSchema,
    formatterDialect: driver.formatterDialect,
    capabilities: driver.capabilities,
  };

  return (
    <UpdateProvider>
    <SessionCacheProvider>
      <EngineProvider info={engineInfo}>
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
      </EngineProvider>
    </SessionCacheProvider>
    </UpdateProvider>
  );
}
