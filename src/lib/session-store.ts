import type { DbEngine, PoolHandle } from "@/lib/db/types";
import { getDriver } from "@/lib/db/registry";

/** What a live session needs in order to reconnect: which engine, and its config. */
export interface SessionCredentials {
  engine: DbEngine;
  config: unknown;
}

// Anchored to `global` so Turbopack/webpack HMR module reloads in dev
// don't reset the Maps and wipe in-memory credentials.
declare global {
  // eslint-disable-next-line no-var
  var __credentialStore: Map<string, SessionCredentials> | undefined;
  // eslint-disable-next-line no-var
  var __poolStore: Map<string, PoolHandle> | undefined;
}

const credentialStore: Map<string, SessionCredentials> =
  global.__credentialStore ?? (global.__credentialStore = new Map());

const poolStore: Map<string, PoolHandle> =
  global.__poolStore ?? (global.__poolStore = new Map());

export function getCredentials(sessionId: string): SessionCredentials | undefined {
  return credentialStore.get(sessionId);
}

export function setCredentials(sessionId: string, credentials: SessionCredentials): void {
  credentialStore.set(sessionId, credentials);
}

/** The engine for a session, or undefined once the session has been cleared. */
export function getSessionEngine(sessionId: string): DbEngine | undefined {
  return credentialStore.get(sessionId)?.engine;
}

export async function clearSession(sessionId: string): Promise<void> {
  const pool = poolStore.get(sessionId);
  const credentials = credentialStore.get(sessionId);
  if (pool && credentials) {
    try {
      await getDriver(credentials.engine).closePool(pool);
    } catch {
      // Ignore close errors
    }
  }
  poolStore.delete(sessionId);
  credentialStore.delete(sessionId);
}

export async function getOrCreatePool(sessionId: string): Promise<PoolHandle> {
  const credentials = credentialStore.get(sessionId);
  if (!credentials) throw new Error("No credentials found for session. Please reconnect.");

  const driver = getDriver(credentials.engine);

  const existing = poolStore.get(sessionId);
  if (existing && driver.isConnected(existing)) return existing;

  const pool = await driver.createPool(credentials.config);
  poolStore.set(sessionId, pool);
  return pool;
}
