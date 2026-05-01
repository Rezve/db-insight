import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getSession } from "@/lib/session";
import { setCredentials, getOrCreatePool, clearSession } from "@/lib/session-store";
import { buildMssqlConfig } from "@/lib/mssql-config";
import { getConnection, decryptPassword, updateConnectionAskToSave, findConnectionByCredentials } from "@/lib/editor-db";

const connectSchema = z.object({
  connectionId: z.string().uuid().optional(),
  engine: z.enum(["sqlserver"]).optional(),
  authMode: z.enum(["sql", "windows"]).optional(),
  server: z.string().min(1, "Server is required").optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  database: z.string().min(1, "Database name is required").optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  encrypt: z.boolean().default(false).optional(),
  trustServerCertificate: z.boolean().default(true).optional(),
}).refine(
  (d) => {
    if (d.connectionId) return true;
    if (!d.server || !d.database) return false;
    if (d.authMode === "sql") return !!d.username && !!d.password;
    return true;
  },
  { message: "Either connectionId or full connection details required" }
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

    let connectData = parsed.data;

    if (parsed.data.connectionId) {
      const saved = getConnection(parsed.data.connectionId);
      if (!saved) {
        return NextResponse.json(
          { success: false, error: "Connection not found" },
          { status: 404 }
        );
      }

      const decryptedPassword = saved.password_enc ? decryptPassword(saved.password_enc) : undefined;
      connectData = {
        connectionId: parsed.data.connectionId,
        engine: saved.engine as "sqlserver",
        authMode: saved.auth_mode as "sql" | "windows",
        server: saved.server,
        port: saved.port,
        database: saved.database_name || "",
        username: saved.username,
        password: decryptedPassword,
        encrypt: saved.encrypt === 1,
        trustServerCertificate: saved.trust_cert === 1,
      };
    }

    if (!connectData.server || !connectData.authMode || !connectData.engine) {
      return NextResponse.json(
        { success: false, error: "Invalid connection data" },
        { status: 400 }
      );
    }

    const database = connectData.database || "";
    const server = connectData.server;
    const config = buildMssqlConfig({
      engine: connectData.engine,
      authMode: connectData.authMode,
      server: connectData.server,
      port: connectData.port,
      username: connectData.username,
      password: connectData.password,
      encrypt: connectData.encrypt ?? false,
      trustServerCertificate: connectData.trustServerCertificate ?? true,
    }, database);
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
    session.connectionId = parsed.data.connectionId;
    session.connected = true;
    session.databaseName = database;
    session.serverName = server;
    await session.save();

    // Check if we should prompt to save this connection
    // Don't prompt if using a saved connection OR if this exact connection already exists in the DB
    const existingConnection = findConnectionByCredentials(
      connectData.server,
      connectData.port,
      connectData.username,
      connectData.database
    );
    const shouldPromptSave = !parsed.data.connectionId && !existingConnection;
    const savedConnectionForThisServer = parsed.data.connectionId ? getConnection(parsed.data.connectionId) : existingConnection;
    const askToSave = savedConnectionForThisServer?.ask_to_save ?? 1;

    return NextResponse.json({
      success: true,
      databaseName: database,
      serverName: server,
      shouldPromptSave,
      askToSave: askToSave === 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
