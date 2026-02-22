import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { SQL_LIST_TABLES } from "@/lib/sql-queries";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import type { TableInfo } from "@/types/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.connected || !session.sessionId) {
    redirect("/connect");
  }

  let tables: TableInfo[] = [];
  try {
    const rows = await executeQuery<{ schema: string; name: string; type: string }>(
      session.sessionId!,
      SQL_LIST_TABLES
    );
    tables = rows.map((row) => ({
      schema: row.schema,
      name: row.name,
      fullName: `${row.schema}.${row.name}`,
      type: row.type as "BASE TABLE" | "VIEW",
    }));
  } catch {
    // If we can't fetch tables, still render the layout
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        serverName={session.serverName ?? "Unknown server"}
        databaseName={session.databaseName ?? "Unknown database"}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar tables={tables} />
        <main className="flex-1 overflow-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
