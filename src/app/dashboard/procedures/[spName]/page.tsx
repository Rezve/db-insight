import { getSession } from "@/lib/session";
import { getSessionDriver, runIntrospection } from "@/lib/db";
import { getDriver } from "@/lib/db/registry";
import SpCodeViewer from "@/components/procedures/SpCodeViewer";

interface Props {
  params: Promise<{ spName: string }>;
}

export default async function ProcedurePage({ params }: Props) {
  const { spName } = await params;
  const decoded = decodeURIComponent(spName);
  const dotIndex = decoded.indexOf(".");

  const session = await getSession();
  const defaultSchema = getDriver(session.engine ?? "sqlserver").defaultSchema;
  const schema = dotIndex !== -1 ? decoded.slice(0, dotIndex) : defaultSchema;
  const name = dotIndex !== -1 ? decoded.slice(dotIndex + 1) : decoded;

  let definition: string | null = null;

  if (session.connected && session.sessionId) {
    try {
      const driver = getSessionDriver(session.sessionId);
      const rows = await runIntrospection<{ definition: string }>(
        session.sessionId,
        driver.introspection.spDefinition(schema, name)
      );
      definition = rows[0]?.definition ?? null;
    } catch {
      // definition stays null
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b flex-shrink-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-0.5">
          Stored Procedure
        </p>
        <h1 className="text-lg font-semibold font-mono">{decoded}</h1>
      </div>

      <div className="flex-1 overflow-hidden">
        {definition ? (
          <SpCodeViewer definition={definition} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No definition available for <span className="font-mono ml-1">{decoded}</span>.
          </div>
        )}
      </div>
    </div>
  );
}
