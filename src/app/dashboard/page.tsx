import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { SQL_LIST_TABLES, SQL_TABLE_SIZES } from "@/lib/sql-queries";
import OverviewTabs from "@/components/dashboard/OverviewTabs";
import type { TableInfo } from "@/types/db";

export default async function DashboardPage() {
  const session = await getSession();
  let tables: TableInfo[] = [];

  try {
    const [rows, sizeRows] = await Promise.all([
      executeQuery<{ schema: string; name: string; type: string }>(
        session.sessionId!,
        SQL_LIST_TABLES
      ),
      executeQuery<{ schema: string; name: string; sizeGB: number }>(
        session.sessionId!,
        SQL_TABLE_SIZES
      ).catch(() => [] as { schema: string; name: string; sizeGB: number }[]),
    ]);

    const sizeMap = new Map<string, number>(
      sizeRows.map((r) => [`${r.schema}.${r.name}`, Number(r.sizeGB)])
    );

    tables = rows.map((row) => ({
      schema: row.schema,
      name: row.name,
      fullName: `${row.schema}.${row.name}`,
      type: row.type as "BASE TABLE" | "VIEW",
      sizeGB: sizeMap.get(`${row.schema}.${row.name}`),
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
          {baseTables.length} tables · {views.length} views
        </p>
      </div>
      <OverviewTabs baseTables={baseTables} views={views} />
    </div>
  );
}
