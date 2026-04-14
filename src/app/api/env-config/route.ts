import { NextResponse } from "next/server";

export interface EnvDbConfig {
  server: string;
  port: number | null;
  authMode: "sql" | "windows";
  username: string | null;
  password: string | null;
  encrypt: boolean;
  trustServerCertificate: boolean;
  database: string | null;
}

export async function GET() {
  const server = process.env.DB_SERVER?.trim();

  if (!server) {
    return NextResponse.json({ config: null });
  }

  const authMode =
    process.env.DB_AUTH_MODE?.trim().toLowerCase() === "windows"
      ? "windows"
      : "sql";

  const rawPort = process.env.DB_PORT?.trim();
  const port = rawPort ? parseInt(rawPort, 10) || null : null;

  const config: EnvDbConfig = {
    server,
    port,
    authMode,
    username: process.env.DB_USERNAME?.trim() || null,
    password: process.env.DB_PASSWORD || null,
    encrypt: process.env.DB_ENCRYPT?.trim().toLowerCase() === "true",
    trustServerCertificate:
      process.env.DB_TRUST_SERVER_CERTIFICATE?.trim().toLowerCase() !== "false",
    database: process.env.DB_DATABASE?.trim() || null,
  };

  return NextResponse.json({ config });
}
