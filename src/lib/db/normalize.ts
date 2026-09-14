/**
 * Coerces driver-native values into something the JSON response and the result
 * grid can render.
 *
 * `pg` hands back arrays, JSON and range types as live JS objects, and `mysql2`
 * returns `Buffer` for BLOB/BIT columns; both would otherwise reach the grid as
 * `[object Object]` or a `{type:"Buffer"}` blob. `bigint` needs handling too —
 * `JSON.stringify` throws on it outright.
 *
 * `Date` is deliberately left alone so it serializes to an ISO string, matching
 * what SQL Server results already do.
 */
export function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `0x${value.toString("hex")}`;
  if (Array.isArray(value) || typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

export function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(row)) out[key] = normalizeValue(row[key]);
    return out;
  });
}
