import { z } from "zod";
import { DB_ENGINES } from "@/lib/db/types";
import { getDriver } from "@/lib/db/registry";
import type { ConnectInput, DbEngine } from "@/lib/db/types";

/**
 * One definition of a connection's shape, shared by `/api/connect`,
 * `/api/databases` and `/api/connections` so the three cannot drift apart.
 */
export const engineSchema = z.enum(DB_ENGINES as [DbEngine, ...DbEngine[]]);

export const authModeSchema = z.enum(["sql", "windows"]);

export const connectionFieldsSchema = z.object({
  engine: engineSchema,
  authMode: authModeSchema,
  server: z.string().min(1, "Server is required"),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  encrypt: z.boolean().default(false),
  trustServerCertificate: z.boolean().default(true),
});

/** Username and password are required for SQL authentication. */
export function hasRequiredCredentials(input: {
  authMode?: string;
  username?: string;
  password?: string;
}): boolean {
  return input.authMode !== "sql" || (!!input.username && !!input.password);
}

/** Rejects an auth mode the engine cannot perform (e.g. Windows auth on MySQL). */
export function isAuthModeSupported(engine: DbEngine, authMode: string): boolean {
  if (authMode !== "windows") return true;
  return getDriver(engine).capabilities.windowsAuth;
}

export function toConnectInput(data: {
  engine: DbEngine;
  authMode: "sql" | "windows";
  server: string;
  port?: number;
  username?: string;
  password?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}): ConnectInput {
  return {
    engine: data.engine,
    authMode: data.authMode,
    server: data.server,
    port: data.port,
    username: data.username,
    password: data.password,
    encrypt: data.encrypt ?? false,
    trustServerCertificate: data.trustServerCertificate ?? true,
  };
}
