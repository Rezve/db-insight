import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { SQL_GET_SP_DEFINITION } from "@/lib/sql-queries";
import SpCodeViewer from "@/components/procedures/SpCodeViewer";
import sql from "mssql";

interface Props {
  params: Promise<{ spName: string }>;
}

export default async function ProcedurePage({ params }: Props) {
  const { spName } = await params;
  const decoded = decodeURIComponent(spName);
  const dotIndex = decoded.indexOf(".");
  const schema = dotIndex !== -1 ? decoded.slice(0, dotIndex) : "dbo";
  const name = dotIndex !== -1 ? decoded.slice(dotIndex + 1) : decoded;

  const session = await getSession();
  let definition: string | null = null;

  if (session.connected && session.sessionId) {
    try {
      const rows = await executeQuery<{ definition: string }>(
        session.sessionId,
        SQL_GET_SP_DEFINITION,
        {
          schema: { type: sql.NVarChar(128), value: schema },
          name: { type: sql.NVarChar(128), value: name },
        }
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
