import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { SQL_LIST_TABLES } from "@/lib/sql-queries";
import TableCard from "@/components/dashboard/TableCard";
import type { TableInfo } from "@/types/db";

export default async function DashboardPage() {
  const session = await getSession();
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return (
      <div className="p-8">
        <p className="text-destructive text-sm">Failed to load tables: {msg}</p>
      </div>
    );
  }

  const baseTables = tables.filter((t) => t.type === "BASE TABLE");
  const views = tables.filter((t) => t.type === "VIEW");

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Database Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {baseTables.length} tables, {views.length} views — click any to start analysis
        </p>
      </div>

      {baseTables.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Tables
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {baseTables.map((table) => (
              <TableCard key={table.fullName} table={table} />
            ))}
          </div>
        </section>
      )}

      {views.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Views
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {views.map((table) => (
              <TableCard key={table.fullName} table={table} />
            ))}
          </div>
        </section>
      )}

      {tables.length === 0 && (
        <p className="text-muted-foreground text-sm">No tables found in this database.</p>
      )}
    </div>
  );
}
