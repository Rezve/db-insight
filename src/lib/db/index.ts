import { getCredentials, getOrCreatePool } from "@/lib/session-store";
import { getDriver } from "./registry";
import type { DbDriver, NeutralResult, PlanMode, PlanResult, PreparedQuery, QueryParams } from "./types";

export * from "./types";
export { getDriver, listDrivers } from "./registry";

/** The driver backing a live session. Throws if the session has no credentials. */
export function getSessionDriver(sessionId: string): DbDriver {
  const credentials = getCredentials(sessionId);
  if (!credentials) throw new Error("No credentials found for session. Please reconnect.");
  return getDriver(credentials.engine);
}

/**
 * Runs a query on the session's pool and returns just the rows.
 *
 * Parameters use the neutral `@name` placeholder style; each driver rewrites
 * them into its own binding syntax.
 */
export async function executeQuery<T = Record<string, unknown>>(
  sessionId: string,
  sql: string,
  params?: QueryParams
): Promise<T[]> {
  const driver = getSessionDriver(sessionId);
  const pool = await getOrCreatePool(sessionId);
  const result = await driver.query(pool, sql, params);
  return result.rows as T[];
}

/** Runs one of the driver's introspection queries and returns its rows. */
export async function runIntrospection<T = Record<string, unknown>>(
  sessionId: string,
  prepared: PreparedQuery
): Promise<T[]> {
  return executeQuery<T>(sessionId, prepared.sql, prepared.params);
}

/** Runs a query and returns the full result, including row counts and messages. */
export async function executeRawQuery(
  sessionId: string,
  sql: string,
  params?: QueryParams
): Promise<NeutralResult> {
  const driver = getSessionDriver(sessionId);
  const pool = await getOrCreatePool(sessionId);
  return driver.query(pool, sql, params);
}

/** Produces an execution plan for `sql` in the engine's native form. */
export async function explainQuery(
  sessionId: string,
  sql: string,
  mode: PlanMode
): Promise<PlanResult> {
  const driver = getSessionDriver(sessionId);
  const pool = await getOrCreatePool(sessionId);
  return driver.explain(pool, sql, mode);
}
