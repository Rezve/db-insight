import { getOrCreatePool } from "./session-store";
import type { ISqlType } from "mssql";

export async function executeQuery<T = Record<string, unknown>>(
  sessionId: string,
  sql: string,
  params?: Record<string, { type: ISqlType | (() => ISqlType); value: unknown }>
): Promise<T[]> {
  const pool = await getOrCreatePool(sessionId);
  const request = pool.request();
  if (params) {
    for (const [name, { type, value }] of Object.entries(params)) {
      request.input(name, type as ISqlType, value);
    }
  }
  const result = await request.query(sql);
  return result.recordset as T[];
}

export async function executeRawQuery(
  sessionId: string,
  sql: string
): Promise<{ recordset: Record<string, unknown>[]; rowsAffected: number[] }> {
  const pool = await getOrCreatePool(sessionId);
  const request = pool.request();
  const result = await request.query(sql);
  return {
    recordset: result.recordset || [],
    rowsAffected: result.rowsAffected,
  };
}
