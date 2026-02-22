"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

interface Column {
  name: string;
  dataType: string;
}

interface ResultsTableProps {
  result: {
    columns: Column[];
    rows: Record<string, unknown>[];
    rowCount: number;
    durationMs: number;
    truncated: boolean;
    error?: string;
    lineNumber?: number;
  } | null;
  loading: boolean;
}

export default function ResultsTable({ result, loading }: ResultsTableProps) {
  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
        Run a query to see results
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-2 text-destructive bg-destructive/10 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Query Error</p>
            <p className="text-sm font-mono">{result.error}</p>
            {result.lineNumber && (
              <p className="text-xs text-muted-foreground">Line {result.lineNumber}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (result.rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
        Query executed successfully — no rows returned
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      {result.truncated && (
        <div className="px-4 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border-b text-xs text-yellow-700 dark:text-yellow-400">
          Results limited to 1,000 rows. Total rows affected: {result.rowCount}
        </div>
      )}
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900 border-b">
          <tr>
            {result.columns.map((col) => (
              <th
                key={col.name}
                className="text-left px-3 py-2 font-medium text-xs text-muted-foreground whitespace-nowrap border-r last:border-r-0"
                title={col.dataType}
              >
                {col.name}
                {col.dataType !== "unknown" && (
                  <span className="ml-1 text-[10px] opacity-60">{col.dataType}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className="border-b hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              {result.columns.map((col) => {
                const val = row[col.name];
                const display =
                  val === null || val === undefined
                    ? null
                    : val instanceof Date
                    ? val.toISOString()
                    : String(val);
                return (
                  <td
                    key={col.name}
                    className="px-3 py-1.5 font-mono text-xs border-r last:border-r-0 max-w-[300px] truncate"
                    title={display ?? ""}
                  >
                    {display === null ? (
                      <span className="text-muted-foreground italic">NULL</span>
                    ) : (
                      display
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
