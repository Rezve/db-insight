"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertCircle, Save, X, Loader2 } from "lucide-react";

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
    rowsAffected?: number[];
  } | null;
  loading: boolean;
  resultSql?: string | null;
}

interface IndexColumn {
  name: string;
  isIncluded: boolean;
  keyOrdinal: number;
}

interface IndexInfo {
  isPrimaryKey: boolean;
  isUnique: boolean;
  isDisabled: boolean;
  columns: IndexColumn[];
}

function ColHeader({ col }: { col: Column }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground whitespace-nowrap border-r last:border-r-0 cursor-default">
          {col.name}
        </th>
      </TooltipTrigger>
      <TooltipContent>
        <span>
          <b>{col.name}</b>
          {col.dataType !== "unknown" && <>: {col.dataType}</>}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function extractSingleTable(sql: string): string | null {
  if (/\b(JOIN|CROSS\s+APPLY|OUTER\s+APPLY)\b/i.test(sql)) return null;
  const m = sql.match(/\bFROM\s+(\[?\w+\]?\.\[?\w+\]?)/i);
  if (!m) return null;
  return m[1].replace(/[\[\]]/g, "");
}

function displayValue(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

export default function ResultsTable({ result, loading, resultSql }: ResultsTableProps) {
  // rowIdx -> colName -> new value
  const [edits, setEdits] = useState<Map<number, Map<string, string | null>>>(new Map());
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [pkColumns, setPkColumns] = useState<string[]>([]);
  const [sourceTable, setSourceTable] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // local working copy of rows — updated after successful saves
  const [localRows, setLocalRows] = useState<Record<string, unknown>[]>([]);
  // snapshot used to build WHERE clauses
  const originalRowsRef = useRef<Record<string, unknown>[]>([]);

  useEffect(() => {
    setEdits(new Map());
    setEditingCell(null);
    setSaveError(null);
    const table = resultSql ? extractSingleTable(resultSql) : null;
    setSourceTable(table);
    if (!table) { setPkColumns([]); return; }
    fetch(`/api/analysis/indexes?table=${encodeURIComponent(table)}`)
      .then((r) => r.json())
      .then((data: { indexes?: IndexInfo[] }) => {
        const pk =
          data.indexes?.find((i) => i.isPrimaryKey) ??
          data.indexes?.find((i) => i.isUnique && !i.isDisabled);
        setPkColumns(
          pk ? pk.columns.filter((c) => !c.isIncluded).map((c) => c.name) : []
        );
      })
      .catch(() => setPkColumns([]));
  }, [resultSql]);

  useEffect(() => {
    if (result?.rows) {
      originalRowsRef.current = result.rows;
      setLocalRows(result.rows);
      setEdits(new Map());
      setEditingCell(null);
      setSaveError(null);
    }
  }, [result]);

  function canEdit(row: Record<string, unknown>): boolean {
    if (!sourceTable || pkColumns.length === 0) return false;
    return pkColumns.every((pk) => pk in row);
  }

  function commitEdit(rowIdx: number, colName: string, newVal: string, original: unknown) {
    setEditingCell(null);
    const originalStr = displayValue(original) ?? "";
    setEdits((prev) => {
      const next = new Map(prev);
      const rowMap = new Map(next.get(rowIdx) ?? []);
      if (newVal === originalStr) {
        rowMap.delete(colName);
      } else {
        rowMap.set(colName, newVal);
      }
      if (rowMap.size === 0) next.delete(rowIdx);
      else next.set(rowIdx, rowMap);
      return next;
    });
  }

  async function saveEdits() {
    if (!sourceTable || edits.size === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updates = Array.from(edits.entries()).map(([rowIdx, rowMap]) => {
        const originalRow = originalRowsRef.current[rowIdx] ?? {};
        const where: Record<string, unknown> = {};
        for (const pk of pkColumns) where[pk] = originalRow[pk];
        const set: Record<string, unknown> = {};
        for (const [col, val] of rowMap) set[col] = val;
        return { where, set };
      });

      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: sourceTable, updates }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSaveError(data.error ?? "Update failed");
      } else {
        // Patch localRows and originalRowsRef with the saved values so cells show correctly
        setLocalRows((prev) => {
          const next = [...prev];
          for (const [rowIdx, rowMap] of edits.entries()) {
            next[rowIdx] = { ...next[rowIdx], ...Object.fromEntries(rowMap) };
          }
          originalRowsRef.current = next;
          return next;
        });
        setEdits(new Map());
      }
    } catch {
      setSaveError("Network error");
    } finally {
      setSaving(false);
    }
  }

  const totalChanges = Array.from(edits.values()).reduce((s, m) => s + m.size, 0);

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
    if (result.columns.length > 0) {
      return (
        <div className="overflow-auto h-full">
          <TooltipProvider>
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900 border-b">
                <tr>
                  {result.columns.map((col) => (
                    <ColHeader key={col.name} col={col} />
                  ))}
                </tr>
              </thead>
              <tbody />
            </table>
          </TooltipProvider>
          <div className="flex items-center justify-center p-6 text-muted-foreground text-sm">
            No rows returned
          </div>
        </div>
      );
    }
    const affected = result.rowsAffected?.reduce((a, b) => a + b, 0) ?? 0;
    const message =
      affected > 0
        ? `${affected} row${affected === 1 ? "" : "s"} affected`
        : "Query executed successfully";
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
        {message}
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full flex flex-col">
      {edits.size > 0 && (
        <div className="px-4 py-1.5 bg-blue-50 dark:bg-blue-900/20 border-b flex items-center gap-3 text-xs flex-shrink-0">
          <span className="text-blue-700 dark:text-blue-300">
            {totalChanges} change{totalChanges !== 1 ? "s" : ""} in {edits.size} row{edits.size !== 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={saveEdits}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => { setEdits(new Map()); setSaveError(null); }}
            disabled={saving}
          >
            <X className="h-3 w-3" />
            Discard
          </Button>
          {saveError && (
            <span className="text-destructive">{saveError}</span>
          )}
        </div>
      )}
      {result.truncated && (
        <div className="px-4 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border-b text-xs text-yellow-700 dark:text-yellow-400 flex-shrink-0">
          Results limited to 1,000 rows. Total rows affected: {result.rowCount}
        </div>
      )}
      <div className="overflow-auto flex-1">
        <TooltipProvider>
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900 border-b">
              <tr>
                {result.columns.map((col) => (
                  <ColHeader key={col.name} col={col} />
                ))}
              </tr>
            </thead>
            <tbody>
              {localRows.map((row, rowIdx) => {
                const editable = canEdit(row);
                return (
                  <tr
                    key={rowIdx}
                    className="border-b hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    {result.columns.map((col) => {
                      const original = row[col.name];
                      const display = displayValue(original);
                      const pendingVal = edits.get(rowIdx)?.get(col.name);
                      const hasPendingEdit = pendingVal !== undefined;
                      const isEditing =
                        editingCell?.row === rowIdx && editingCell?.col === col.name;

                      return (
                        <td
                          key={col.name}
                          className={[
                            "px-3 py-1.5 font-mono text-xs border-r last:border-r-0 max-w-[300px]",
                            hasPendingEdit
                              ? "bg-yellow-50 dark:bg-yellow-900/20"
                              : "",
                            editable && !isEditing ? "cursor-text" : "",
                          ].join(" ")}
                          title={!isEditing ? (hasPendingEdit ? String(pendingVal) : display ?? "") : undefined}
                          onDoubleClick={() => {
                            if (editable) setEditingCell({ row: rowIdx, col: col.name });
                          }}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              defaultValue={hasPendingEdit ? (pendingVal ?? "") : (display ?? "")}
                              className="w-full min-w-[80px] bg-white dark:bg-zinc-800 border border-blue-400 rounded px-1 outline-none font-mono text-xs"
                              onBlur={(e) => commitEdit(rowIdx, col.name, e.target.value, original)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                            />
                          ) : hasPendingEdit ? (
                            <span className="truncate block">{pendingVal ?? <span className="text-muted-foreground italic">NULL</span>}</span>
                          ) : display === null ? (
                            <span className="text-muted-foreground italic">NULL</span>
                          ) : (
                            <span className="truncate block">{display}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TooltipProvider>
      </div>
    </div>
  );
}
