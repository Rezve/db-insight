import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getSession } from "@/lib/session";
import { setCredentials, getOrCreatePool, clearSession } from "@/lib/session-store";
import { buildMssqlConfig } from "@/lib/mssql-config";

const connectSchema = z.object({
  engine: z.enum(["sqlserver"]),
  authMode: z.enum(["sql", "windows"]),
  server: z.string().min(1, "Server is required"),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  database: z.string().min(1, "Database name is required"),
  username: z.string().optional(),
  password: z.string().optional(),
  encrypt: z.boolean().default(false),
  trustServerCertificate: z.boolean().default(true),
}).refine(
  (d) => d.authMode !== "sql" || (!!d.username && !!d.password),
  { message: "Username and password are required for SQL Server authentication" }
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = connectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors.map((e) => e.message).join(", ") },
        { status: 400 }
      );
    }

    const { database, server } = parsed.data;
    const config = buildMssqlConfig(parsed.data, database);
    const sessionId = randomUUID();

    setCredentials(sessionId, config);

    try {
      await getOrCreatePool(sessionId);
    } catch (err) {
      await clearSession(sessionId);
      const message = err instanceof Error ? err.message : "Connection failed";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }

    const session = await getSession();
    session.sessionId = sessionId;
    session.connected = true;
    session.databaseName = database;
    session.serverName = server; // original user-entered string for display
    await session.save();

    return NextResponse.json({ success: true, databaseName: database, serverName: server });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
