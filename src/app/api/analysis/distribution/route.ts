import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeQuery, getSessionDriver, runIntrospection } from "@/lib/db";
import type { SampleSize, ColumnStat, TopValue } from "@/types/analysis";

const TOP_VALUE_LIMIT = 20;

export async function GET(req: NextRequest) {
  // Pre-flight validation — these return normal JSON error responses before any stream is created
  const session = await getSession();
  if (!session.connected || !session.sessionId) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }
  const sessionId = session.sessionId;

  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table");
  const sampleSize = (searchParams.get("sampleSize") ?? "small") as SampleSize;

  if (!table || !table.includes(".")) {
    return NextResponse.json({ error: "table parameter required (schema.name)" }, { status: 400 });
  }

  const [schema, tableName] = table.split(".", 2);

  // Get columns for this table (pre-flight — needed to know totalColumns before stream starts)
  let tableColumns: Array<{
    tableSchema: string;
    tableName: string;
    columnName: string;
    dataType: string;
    isNullable: string;
    maxLength: number | null;
  }>;

  const driver = getSessionDriver(sessionId);

  try {
    const colRows = await runIntrospection<{
      tableSchema: string;
      tableName: string;
      columnName: string;
      dataType: string;
      isNullable: string;
      maxLength: number | null;
    }>(sessionId, driver.introspection.schemaColumns());

    tableColumns = colRows.filter(
      (r) => r.tableSchema === schema && r.tableName === tableName
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (tableColumns.length === 0) {
    return NextResponse.json({ error: "Table not found or no columns" }, { status: 404 });
  }

  // Stream the heavy per-column analysis as NDJSON events
  const encoder = new TextEncoder();
  const capturedTableColumns = tableColumns;

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        emit({
          type: "start",
          totalColumns: capturedTableColumns.length,
          message: "Fetching row count...",
        });

        const dist = driver.introspection.distribution;
        const sampleClause = dist.sampleClause(schema, tableName, sampleSize);

        const countRows = await executeQuery<{ cnt: number }>(
          sessionId,
          dist.rowCount(sampleClause)
        );
        const actualRowsScanned = Number(countRows[0]?.cnt ?? 0);

        const columnStats: ColumnStat[] = [];

        for (let i = 0; i < capturedTableColumns.length; i++) {
          const col = capturedTableColumns[i];
          const current = i + 1;
          const total = capturedTableColumns.length;

          emit({
            type: "progress",
            current,
            total,
            column: col.columnName,
            message: `Analyzing column '${col.columnName}' (${current} of ${total})...`,
          });

          const colQ = driver.quoteId(col.columnName);
          const isNumeric = dist.isNumericType(col.dataType);

          // Base stats: null count, distinct count
          const baseQuery = dist.baseStats(colQ, sampleClause, isNumeric);

          const baseRows = await executeQuery<{
            totalRows: number;
            nonNullCount: number;
            nullCount: number;
            distinctCount: number;
            minValue?: number;
            maxValue?: number;
            avgValue?: number;
            stddev?: number;
          }>(sessionId, baseQuery);

          const base = baseRows[0];

          // Top values (skip for high-cardinality numeric unless few distinct values)
          let topValues: TopValue[] = [];
          const shouldFetchTopValues = !isNumeric || Number(base?.distinctCount ?? 0) <= 50;

          if (shouldFetchTopValues && actualRowsScanned > 0) {
            const topQuery = dist.topValues(
              colQ,
              sampleClause,
              actualRowsScanned,
              TOP_VALUE_LIMIT
            );
            try {
              const topRows = await executeQuery<{ value: string; count: number; percentage: number }>(
                sessionId,
                topQuery
              );
              topValues = topRows.map((r) => ({
                value: String(r.value ?? "(null)"),
                count: Number(r.count),
                percentage: Number(r.percentage),
              }));
            } catch {
              // Some types can't be cast to NVARCHAR — skip top values
            }
          }

          columnStats.push({
            name: col.columnName,
            dataType: col.dataType,
            totalRows: Number(base?.totalRows ?? 0),
            nonNullCount: Number(base?.nonNullCount ?? 0),
            nullCount: Number(base?.nullCount ?? 0),
            distinctCount: Number(base?.distinctCount ?? 0),
            // Exact numeric types can come back as strings to preserve
            // precision, so coerce before the charts consume them.
            ...(isNumeric && base?.minValue != null
              ? {
                  minValue: Number(base.minValue),
                  maxValue: Number(base.maxValue),
                  avgValue: Number(base.avgValue),
                  stddev: base.stddev == null ? undefined : Number(base.stddev),
                }
              : {}),
            topValues,
          });
        }

        emit({
          type: "complete",
          data: {
            tableName: table,
            sampleSize,
            actualRowsScanned,
            columns: columnStats,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected error";
        emit({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
    },
  });
}
