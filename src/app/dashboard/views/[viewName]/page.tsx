import Link from "next/link";
import { Table2 } from "lucide-react";
import { getSession } from "@/lib/session";
import { getSessionDriver, runIntrospection } from "@/lib/db";
import { getDriver } from "@/lib/db/registry";
import SpCodeViewer from "@/components/procedures/SpCodeViewer";

interface Props {
  params: Promise<{ viewName: string }>;
}

export default async function ViewPage({ params }: Props) {
  const { viewName } = await params;
  const decoded = decodeURIComponent(viewName);
  const dotIndex = decoded.indexOf(".");

  const session = await getSession();
  const defaultSchema = getDriver(session.engine ?? "sqlserver").defaultSchema;
  const schema = dotIndex !== -1 ? decoded.slice(0, dotIndex) : defaultSchema;
  const name = dotIndex !== -1 ? decoded.slice(dotIndex + 1) : decoded;

  let definition: string | null = null;

  if (session.connected && session.sessionId) {
    try {
      const driver = getSessionDriver(session.sessionId);
      const rows = await runIntrospection<{ definition: string | null }>(
        session.sessionId,
        driver.introspection.viewDefinition(schema, name)
      );
      definition = rows[0]?.definition ?? null;
    } catch {
      // definition stays null
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b flex-shrink-0 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-0.5">
            View
          </p>
          <h1 className="text-lg font-semibold font-mono truncate">{decoded}</h1>
        </div>
        <Link
          href={`/dashboard/tables/${encodeURIComponent(`${schema}.${name}`)}?tab=schema`}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
        >
          <Table2 className="h-3.5 w-3.5" />
          Columns &amp; data
        </Link>
      </div>

      <div className="flex-1 overflow-hidden">
        {definition ? (
          <SpCodeViewer definition={definition} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No definition available for <span className="font-mono mx-1">{decoded}</span>
            {(session.engine ?? "sqlserver") === "sqlserver" &&
              "(it may be encrypted, or you may lack VIEW DEFINITION permission)"}
          </div>
        )}
      </div>
    </div>
  );
}
