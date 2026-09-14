import { NextRequest, NextResponse } from "next/server";
import { getDriver } from "@/lib/db/registry";
import {
  connectionFieldsSchema,
  hasRequiredCredentials,
  isAuthModeSupported,
  toConnectInput,
} from "@/lib/connection-schema";

const schema = connectionFieldsSchema.refine(hasRequiredCredentials, {
  message: "Username and password are required for SQL authentication",
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors.map((e) => e.message).join(", ") },
        { status: 400 }
      );
    }

    const input = toConnectInput(parsed.data);
    const driver = getDriver(input.engine);

    if (!isAuthModeSupported(input.engine, input.authMode)) {
      return NextResponse.json(
        { error: `${driver.label} does not support Windows authentication` },
        { status: 400 }
      );
    }

    // Enumerating databases needs a connection, so use the engine's bootstrap
    // database. MySQL can connect without selecting one at all.
    const config = driver.buildConfig(input, driver.bootstrapDatabase ?? "");
    const pool = await driver.createPool(config);

    try {
      const databases = await driver.listDatabases(pool);
      return NextResponse.json({ databases });
    } finally {
      await driver.closePool(pool).catch(() => {});
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
