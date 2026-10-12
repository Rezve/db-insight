import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDriver } from "@/lib/db/registry";
import {
  connectionFieldsSchema,
  hasRequiredCredentials,
  isAuthModeSupported,
  toConnectInput,
} from "@/lib/connection-schema";

const schema = connectionFieldsSchema.extend({
  // Optional starting database. Contained users (common on Azure SQL) exist
  // only in their own database and cannot log in to the bootstrap database.
  database: z.string().trim().optional(),
}).refine(hasRequiredCredentials, {
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

    // Enumerating databases needs a connection: use the database the user named,
    // else the engine's bootstrap database. MySQL can connect without one at all.
    const requested = parsed.data.database || undefined;
    const config = driver.buildConfig(input, requested ?? driver.bootstrapDatabase ?? "");
    const pool = await driver.createPool(config);

    try {
      let databases: string[];
      try {
        databases = await driver.listDatabases(pool);
      } catch (err) {
        // A restricted user may be able to connect but not enumerate.
        if (!requested) throw err;
        databases = [];
      }
      if (requested && !databases.includes(requested)) databases.unshift(requested);
      return NextResponse.json({ databases });
    } finally {
      await driver.closePool(pool).catch(() => {});
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
