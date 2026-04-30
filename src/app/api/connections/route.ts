import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { listConnections, saveConnection, deleteConnection, SavedConnection, encryptPassword } from "@/lib/editor-db";

const saveConnectionSchema = z.object({
  name: z.string().min(1, "Connection name is required"),
  tag: z.string().optional(),
  color: z.string().optional(),
  engine: z.enum(["sqlserver"]),
  server: z.string().min(1, "Server is required"),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  auth_mode: z.enum(["sql", "windows"]),
  username: z.string().optional(),
  password: z.string().optional(),
  database_name: z.string().optional(),
  encrypt: z.boolean().default(false),
  trust_cert: z.boolean().default(false),
});

export async function GET() {
  try {
    const connections = listConnections();
    return NextResponse.json({ connections });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = saveConnectionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors.map((e) => e.message).join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const id = randomUUID();
    const passwordEnc = data.password && data.auth_mode === "sql" ? encryptPassword(data.password) : undefined;

    const conn: SavedConnection = {
      id,
      name: data.name,
      tag: data.tag,
      color: data.color,
      engine: data.engine,
      server: data.server,
      port: data.port,
      auth_mode: data.auth_mode,
      username: data.username,
      password_enc: passwordEnc,
      database_name: data.database_name,
      encrypt: data.encrypt ? 1 : 0,
      trust_cert: data.trust_cert ? 1 : 0,
      ask_to_save: 1,
      created_at: new Date().toISOString(),
    };

    saveConnection(conn);

    return NextResponse.json({ success: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Connection ID required" }, { status: 400 });
    }

    deleteConnection(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
