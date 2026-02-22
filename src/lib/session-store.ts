import type { ConnectionPool } from "mssql";
import type { ConnectionConfig } from "@/types/db";

// Anchored to `global` so Turbopack/webpack HMR module reloads in dev
// don't reset the Maps and wipe in-memory credentials.
declare global {
  // eslint-disable-next-line no-var
  var __credentialStore: Map<string, ConnectionConfig> | undefined;
  // eslint-disable-next-line no-var
  var __poolStore: Map<string, ConnectionPool> | undefined;
}

const credentialStore: Map<string, ConnectionConfig> =
  global.__credentialStore ?? (global.__credentialStore = new Map());

const poolStore: Map<string, ConnectionPool> =
  global.__poolStore ?? (global.__poolStore = new Map());

export function getCredentials(sessionId: string): ConnectionConfig | undefined {
  return credentialStore.get(sessionId);
}

export function setCredentials(sessionId: string, config: ConnectionConfig): void {
  credentialStore.set(sessionId, config);
}

export async function clearSession(sessionId: string): Promise<void> {
  const pool = poolStore.get(sessionId);
  if (pool) {
    try {
      await pool.close();
    } catch {
      // Ignore close errors
    }
    poolStore.delete(sessionId);
  }
  credentialStore.delete(sessionId);
}

export async function getOrCreatePool(sessionId: string): Promise<ConnectionPool> {
  const existing = poolStore.get(sessionId);
  if (existing && existing.connected) return existing;

  const config = credentialStore.get(sessionId);
  if (!config) throw new Error("No credentials found for session. Please reconnect.");

  const { ConnectionPool } = await import("mssql");
  const pool = new ConnectionPool(config);
  await pool.connect();
  poolStore.set(sessionId, pool);
  return pool;
}
