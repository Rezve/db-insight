import type { ConnectionPool } from "mssql";
import type { ConnectionConfig } from "@/types/db";

// Module-level singletons — live in server memory only, never serialized or sent to client
const credentialStore = new Map<string, ConnectionConfig>();
const poolStore = new Map<string, ConnectionPool>();

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
