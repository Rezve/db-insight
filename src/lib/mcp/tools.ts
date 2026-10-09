import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOrCreatePool } from "@/lib/session-store";
import { getSessionDriver, runIntrospection } from "@/lib/db";
import { addMcpAudit } from "@/lib/editor-db";
import { assertReadOnly, ReadOnlyViolation } from "./guard";
import { requestApproval } from "./approvals";
import { getMcpState } from "./state";

const DEFAULT_MAX_ROWS = 200;
const HARD_MAX_ROWS = 1000;
const QUERY_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 200_000;

interface Ctx {
  sessionId: string;
  client: string;
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function toText(value: unknown): string {
  const text = JSON.stringify(
    value,
    (_k, v) => (typeof v === "bigint" ? v.toString() : v instanceof Date ? v.toISOString() : v),
    2
  );
  return text.length > MAX_OUTPUT_CHARS ? text.slice(0, MAX_OUTPUT_CHARS) + "\n…[output truncated]" : text;
}

const ok = (value: unknown): ToolResult => ({ content: [{ type: "text", text: toText(value) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

function splitTable(sessionId: string, table: string): [string, string] {
  const dot = table.indexOf(".");
  if (dot > 0) return [table.slice(0, dot), table.slice(dot + 1)];
  const def = getSessionDriver(sessionId).defaultSchema;
  if (def) return [def, table];
  throw new Error('Table must be given as "schema.name".');
}

/** Runs a tool body, recording the outcome in the audit log. */
async function audited(
  ctx: Ctx,
  tool: string,
  input: string,
  body: () => Promise<{ result: ToolResult; rowCount?: number; outcome?: string; detail?: string }>
): Promise<ToolResult> {
  const state = getMcpState(ctx.sessionId);
  if (!state) return fail("MCP access has been turned off.");
  const started = Date.now();
  const log = (outcome: string, rowCount?: number | null, detail?: string) => {
    try {
      addMcpAudit({
        serverName: state.serverName,
        databaseName: state.databaseName,
        client: ctx.client,
        tool,
        input,
        outcome,
        rowCount,
        durationMs: Date.now() - started,
        detail,
      });
    } catch {
      // Logging must never break the tool call.
    }
  };
  try {
    const { result, rowCount, outcome, detail } = await body();
    log(outcome ?? "ok", rowCount, detail);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    log(err instanceof ReadOnlyViolation ? "blocked" : "error", null, message);
    return fail(message);
  }
}

/** Validates read-only, then waits for user approval when the session requires it. */
async function guardAndApprove(ctx: Ctx, tool: string, sql: string): Promise<"denied" | "timeout" | null> {
  assertReadOnly(getSessionDriver(ctx.sessionId).engine, sql);
  const state = getMcpState(ctx.sessionId);
  if (!state?.requireApproval || state.allowedForSession) return null;
  const decision = await requestApproval(ctx.sessionId, { tool, sql, client: ctx.client });
  return decision === "approved" ? null : decision;
}

export function createMcpServer(ctx: Ctx): McpServer {
  const server = new McpServer({ name: "db-insight", version: "1.0.0" });
  const introspection = () => getSessionDriver(ctx.sessionId).introspection;
  const table = z.string().describe('Table as "schema.name" (e.g. "dbo.Orders")');
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

  server.registerTool(
    "list_tables",
    { description: "List all tables and views in the connected database.", annotations: readOnly },
    () =>
      audited(ctx, "list_tables", "", async () => {
        const rows = await runIntrospection(ctx.sessionId, introspection().listTables());
        return { result: ok(rows), rowCount: rows.length };
      })
  );

  server.registerTool(
    "get_schema",
    {
      description:
        "Get columns and foreign keys for all tables, or just one table. Includes stored procedure and function names.",
      inputSchema: { table: table.optional() },
      annotations: readOnly,
    },
    ({ table: t }) =>
      audited(ctx, "get_schema", t ?? "", async () => {
        const i = introspection();
        const [cols, fks, routines] = await Promise.all([
          runIntrospection<Record<string, unknown>>(ctx.sessionId, i.schemaColumns()),
          runIntrospection<Record<string, unknown>>(ctx.sessionId, i.schemaForeignKeys()),
          runIntrospection(ctx.sessionId, i.schemaRoutines()),
        ]);
        let filter = (_r: Record<string, unknown>) => true;
        let fkFilter = filter;
        if (t) {
          const [schema, name] = splitTable(ctx.sessionId, t);
          filter = (r) => r.tableSchema === schema && r.tableName === name;
          fkFilter = (r) => r.sourceSchema === schema && r.sourceTable === name;
        }
        const columns = cols.filter(filter);
        return {
          result: ok({ columns, foreignKeys: fks.filter(fkFilter), routines: t ? undefined : routines }),
          rowCount: columns.length,
        };
      })
  );

  server.registerTool(
    "get_table_details",
    {
      description:
        "Detailed column info (types, nullability, defaults, keys), foreign keys, approximate row count and size for one table.",
      inputSchema: { table },
      annotations: readOnly,
    },
    ({ table: t }) =>
      audited(ctx, "get_table_details", t, async () => {
        const [schema, name] = splitTable(ctx.sessionId, t);
        const i = introspection();
        const optional = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
        const [columns, foreignKeys, rowCount, size] = await Promise.all([
          runIntrospection(ctx.sessionId, i.tableColumns(schema, name)),
          optional(runIntrospection(ctx.sessionId, i.fkDetails(schema, name))),
          optional(runIntrospection(ctx.sessionId, i.rowCountFast(schema, name))),
          optional(runIntrospection(ctx.sessionId, i.tableSize(schema, name))),
        ]);
        return { result: ok({ table: t, columns, foreignKeys, rowCount: rowCount[0], size: size[0] }), rowCount: columns.length };
      })
  );

  server.registerTool(
    "get_indexes",
    {
      description: "List the indexes on a table with their columns, uniqueness, and size.",
      inputSchema: { table },
      annotations: readOnly,
    },
    ({ table: t }) =>
      audited(ctx, "get_indexes", t, async () => {
        const [schema, name] = splitTable(ctx.sessionId, t);
        const i = introspection();
        const [rows, sizes] = await Promise.all([
          runIntrospection<Record<string, unknown>>(ctx.sessionId, i.indexInfo(schema, name)),
          runIntrospection<Record<string, unknown>>(ctx.sessionId, i.indexSizes(schema, name)).catch(() => []),
        ]);
        const sizeById = new Map(sizes.map((s) => [Number(s.indexId), s.sizeGB]));
        const byId = new Map<number, Record<string, unknown> & { columns: unknown[] }>();
        for (const r of rows) {
          const id = Number(r.indexId);
          if (!byId.has(id)) {
            byId.set(id, {
              indexName: r.indexName ?? "(Heap)",
              type: r.type,
              isUnique: Boolean(r.isUnique),
              isPrimaryKey: Boolean(r.isPrimaryKey),
              isDisabled: Boolean(r.isDisabled),
              filterDefinition: r.filterDefinition,
              sizeGB: sizeById.get(id) ?? null,
              columns: [],
            });
          }
          if (r.columnName) {
            byId.get(id)!.columns.push({ name: r.columnName, isIncluded: Boolean(r.isIncluded), keyOrdinal: Number(r.keyOrdinal) });
          }
        }
        return { result: ok({ table: t, indexes: [...byId.values()] }), rowCount: byId.size };
      })
  );

  server.registerTool(
    "get_index_usage",
    {
      description:
        "Index usage statistics for a table (seeks, scans, lookups, updates). May be empty if the login lacks permission to read server statistics.",
      inputSchema: { table },
      annotations: readOnly,
    },
    ({ table: t }) =>
      audited(ctx, "get_index_usage", t, async () => {
        const [schema, name] = splitTable(ctx.sessionId, t);
        const rows = await runIntrospection(ctx.sessionId, introspection().indexUsage(schema, name)).catch(() => []);
        return { result: ok({ table: t, usage: rows }), rowCount: rows.length };
      })
  );

  server.registerTool(
    "get_missing_indexes",
    {
      description: "Engine-suggested missing indexes for a table (SQL Server only; empty elsewhere).",
      inputSchema: { table },
      annotations: readOnly,
    },
    ({ table: t }) =>
      audited(ctx, "get_missing_indexes", t, async () => {
        const driver = getSessionDriver(ctx.sessionId);
        if (!driver.capabilities.missingIndexAdvisor) {
          return { result: ok({ table: t, suggestions: [], unsupported: true }), rowCount: 0 };
        }
        const [schema, name] = splitTable(ctx.sessionId, t);
        const rows = await runIntrospection(ctx.sessionId, driver.introspection.missingIndexes(schema, name));
        return { result: ok({ table: t, suggestions: rows }), rowCount: rows.length };
      })
  );

  server.registerTool(
    "get_performance_summary",
    {
      description:
        "Database-level summary: object counts, storage, row totals, index health and usage, server version and uptime.",
      annotations: readOnly,
    },
    () =>
      audited(ctx, "get_performance_summary", "", async () => {
        const i = introspection();
        const optional = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
        const run = (q: ReturnType<typeof i.summaryStorage>) => optional(runIntrospection(ctx.sessionId, q));
        const [objects, storage, rows, indexHealth, indexUsage, server] = await Promise.all([
          run(i.summaryObjectCounts()),
          run(i.summaryStorage()),
          run(i.summaryRowCount()),
          run(i.summaryIndexHealth()),
          run(i.summaryIndexUsage()),
          run(i.summaryServerInfo()),
        ]);
        return {
          result: ok({
            objects: objects[0],
            storage: storage[0],
            rows: rows[0],
            indexHealth: indexHealth[0],
            indexUsage: indexUsage[0],
            server: server[0],
          }),
        };
      })
  );

  server.registerTool(
    "get_table_sizes",
    { description: "Storage size and row counts for every table, largest first where supported.", annotations: readOnly },
    () =>
      audited(ctx, "get_table_sizes", "", async () => {
        const rows = await runIntrospection(ctx.sessionId, introspection().tableSizes());
        return { result: ok(rows), rowCount: rows.length };
      })
  );

  server.registerTool(
    "get_stored_procedure_definition",
    {
      description: "Source definition of a stored procedure or function (read-only; it cannot be executed).",
      inputSchema: { schema: z.string(), name: z.string() },
      annotations: readOnly,
    },
    ({ schema, name }) =>
      audited(ctx, "get_stored_procedure_definition", `${schema}.${name}`, async () => {
        const rows = await runIntrospection<{ definition: string }>(
          ctx.sessionId,
          introspection().spDefinition(schema, name)
        );
        if (!rows.length) throw new Error("Not found.");
        return { result: { content: [{ type: "text" as const, text: String(rows[0].definition) }] } };
      })
  );

  server.registerTool(
    "run_query",
    {
      description:
        "Run a single read-only SELECT (or WITH ... SELECT) query and return the rows. Writes, DDL, multiple statements, and SELECT INTO are rejected. " +
        "The user may have to approve each query in the DB Insight app before it runs. " +
        `Results are capped at ${HARD_MAX_ROWS} rows (default ${DEFAULT_MAX_ROWS}) and a ${QUERY_TIMEOUT_MS / 1000}s timeout applies.`,
      inputSchema: {
        sql: z.string().describe("A single SELECT statement"),
        max_rows: z.number().int().min(1).max(HARD_MAX_ROWS).optional(),
      },
      annotations: readOnly,
    },
    ({ sql, max_rows }) =>
      audited(ctx, "run_query", sql, async () => {
        const blocked = await guardAndApprove(ctx, "run_query", sql);
        if (blocked) {
          return {
            result: fail(blocked === "denied" ? "The user denied this query." : "Timed out waiting for the user to approve this query."),
            outcome: blocked,
          };
        }
        const limit = max_rows ?? DEFAULT_MAX_ROWS;
        const driver = getSessionDriver(ctx.sessionId);
        const pool = await getOrCreatePool(ctx.sessionId);
        const result = await driver.readOnlyQuery(pool, sql, { timeoutMs: QUERY_TIMEOUT_MS });
        const truncated = result.rows.length > limit;
        const rows = truncated ? result.rows.slice(0, limit) : result.rows;
        return {
          result: ok({ columns: result.columns, rows, rowCount: result.rows.length, truncated }),
          rowCount: rows.length,
          outcome: "approved",
        };
      })
  );

  server.registerTool(
    "explain_query",
    {
      description:
        "Get the estimated execution plan for a read-only SELECT without running it. Subject to the same read-only rules and user approval as run_query.",
      inputSchema: { sql: z.string() },
      annotations: readOnly,
    },
    ({ sql }) =>
      audited(ctx, "explain_query", sql, async () => {
        const blocked = await guardAndApprove(ctx, "explain_query", sql);
        if (blocked) {
          return {
            result: fail(blocked === "denied" ? "The user denied this request." : "Timed out waiting for the user to approve this request."),
            outcome: blocked,
          };
        }
        const driver = getSessionDriver(ctx.sessionId);
        const pool = await getOrCreatePool(ctx.sessionId);
        const plan = await driver.explain(pool, sql, "estimated");
        if (!plan.planXml && !plan.planText) {
          throw new Error(
            "The database returned no execution plan. Check that the login has SHOWPLAN permission and that the statement is a valid SELECT."
          );
        }
        return { result: ok(plan), outcome: "approved" };
      })
  );

  return server;
}
