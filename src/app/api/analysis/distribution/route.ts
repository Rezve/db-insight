import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeQuery } from "@/lib/db";
import { buildSampleClause, quoteId, SQL_SCHEMA_COLUMNS } from "@/lib/sql-queries";
import type { SampleSize, ColumnStat, TopValue } from "@/types/analysis";

const NUMERIC_TYPES = new Set([
  "int", "bigint", "smallint", "tinyint", "bit",
  "decimal", "numeric", "money", "smallmoney",
  "float", "real",
]);

const DATE_TYPES = new Set(["date", "datetime", "datetime2", "datetimeoffset", "smalldatetime", "time"]);

export async function GET(req: NextRequest) {
  // Pre-flight validation — these return normal JSON error responses before any stream is created
  const session = await getSession();
  if (!session.connected || !session.sessionId) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

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

  try {
    const colRows = await executeQuery<{
      tableSchema: string;
      tableName: string;
      columnName: string;
      dataType: string;
      isNullable: string;
      maxLength: number | null;
    }>(session.sessionId, SQL_SCHEMA_COLUMNS);

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

        const sampleClause = buildSampleClause(schema, tableName, sampleSize);

        const countRows = await executeQuery<{ cnt: number }>(
          session.sessionId,
          `SELECT COUNT(*) AS [cnt] FROM ${sampleClause}`
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

          const colQ = quoteId(col.columnName);
          const dataType = col.dataType.toLowerCase();
          const isNumeric = NUMERIC_TYPES.has(dataType);

          // Base stats: null count, distinct count
          const baseQuery = `
            SELECT
              COUNT(*)          AS [totalRows],
              COUNT(${colQ})    AS [nonNullCount],
              COUNT(*) - COUNT(${colQ}) AS [nullCount],
              COUNT(DISTINCT ${colQ}) AS [distinctCount]
              ${isNumeric ? `,
              MIN(CAST(${colQ} AS FLOAT)) AS [minValue],
              MAX(CAST(${colQ} AS FLOAT)) AS [maxValue],
              AVG(CAST(${colQ} AS FLOAT)) AS [avgValue],
              STDEV(CAST(${colQ} AS FLOAT)) AS [stddev]` : ""}
            FROM ${sampleClause}
          `;

          const baseRows = await executeQuery<{
            totalRows: number;
            nonNullCount: number;
            nullCount: number;
            distinctCount: number;
            minValue?: number;
            maxValue?: number;
            avgValue?: number;
            stddev?: number;
          }>(session.sessionId, baseQuery);

          const base = baseRows[0];

          // Top values (skip for high-cardinality numeric unless few distinct values)
          let topValues: TopValue[] = [];
          const shouldFetchTopValues = !isNumeric || Number(base?.distinctCount ?? 0) <= 50;

          if (shouldFetchTopValues && actualRowsScanned > 0) {
            const topQuery = `
              SELECT TOP 20
                CAST(${colQ} AS NVARCHAR(500)) AS [value],
                COUNT(*)                        AS [count],
                CAST(COUNT(*) * 100.0 / ${actualRowsScanned} AS DECIMAL(6,2)) AS [percentage]
              FROM ${sampleClause}
              WHERE ${colQ} IS NOT NULL
              GROUP BY ${colQ}
              ORDER BY COUNT(*) DESC
            `;
            try {
              const topRows = await executeQuery<{ value: string; count: number; percentage: number }>(
                session.sessionId,
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
            ...(isNumeric && base?.minValue !== undefined
              ? {
                  minValue: base.minValue,
                  maxValue: base.maxValue,
                  avgValue: base.avgValue,
                  stddev: base.stddev,
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
