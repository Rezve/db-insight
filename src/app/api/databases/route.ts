import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ConnectionPool } from "mssql";
import { buildMssqlConfig } from "@/lib/mssql-config";

const schema = z.object({
  engine: z.enum(["sqlserver"]),
  authMode: z.enum(["sql", "windows"]),
  server: z.string().min(1, "Server is required"),
  port: z.coerce.number().int().min(1).max(65535).optional(),
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
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors.map((e) => e.message).join(", ") },
        { status: 400 }
      );
    }

    const config = buildMssqlConfig(parsed.data, "master");
    const pool = new ConnectionPool(config);

    try {
      await pool.connect();
      const result = await pool.request().query(`
        SELECT name
        FROM sys.databases
        WHERE state_desc = 'ONLINE'
        ORDER BY
          CASE WHEN name IN ('master','model','msdb','tempdb') THEN 1 ELSE 0 END,
          name
      `);
      const databases: string[] = result.recordset.map((r: { name: string }) => r.name);
      return NextResponse.json({ databases });
    } finally {
      await pool.close().catch(() => {});
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
