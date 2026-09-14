import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDriver } from "@/lib/db/registry";

export async function GET() {
  const session = await getSession();
  const engine = session.engine ?? "sqlserver";

  // The UI uses these to hide panels the engine cannot serve.
  const driver = getDriver(engine);

  return NextResponse.json({
    serverName: session.serverName ?? "",
    databaseName: session.databaseName ?? "",
    engine,
    engineLabel: driver.label,
    defaultSchema: driver.defaultSchema,
    formatterDialect: driver.formatterDialect,
    capabilities: driver.capabilities,
  });
}
