"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ResultsTable from "@/components/editor/ResultsTable";
import { quoteId } from "@/lib/sql-queries";

interface TableDataTabProps {
  tableName: string;
}

interface QueryResult {
  columns: { name: string; dataType: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
  error?: string;
  lineNumber?: number;
  rowsAffected?: number[];
}

// Compiled once at module level — lastIndex is reset inside highlightSQL before each use
const HIGHLIGHT_RULES: Array<[RegExp, string]> = [
  [/\[[^\]]*\]/gy, "color:#fbbf24"],
  [/\b(SELECT|FROM|WHERE|AND|OR|NOT|NULL|TOP|ORDER|BY|GROUP|HAVING|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|DISTINCT|INTO|SET|UPDATE|INSERT|DELETE|EXEC|WITH|UNION|ALL|CASE|WHEN|THEN|ELSE|END|IS|IN|LIKE|BETWEEN|EXISTS|ASC|DESC|CROSS|FULL)\b/giy, "color:#60a5fa;font-weight:600"],
  [/\b(INT|BIGINT|SMALLINT|TINYINT|VARCHAR|NVARCHAR|CHAR|NCHAR|DECIMAL|NUMERIC|FLOAT|REAL|DATETIME2|DATETIME|DATE|TIME|BIT|MONEY|UNIQUEIDENTIFIER|VARBINARY|BINARY|XML|MAX)\b/giy, "color:#34d399"],
  [/'[^']*'/gy, "color:#f472b6"],
  [/--[^\n]*/gy, "color:#6b7280;font-style:italic"],
  [/\b\d+\b/gy, "color:#fb923c"],
  [/[(),;*]/gy, "color:#94a3b8"],
  [/\s+/gy, ""],
  [/[\s\S]/gy, ""],
];

function highlightSQL(sql: string): string {
  let html = "";
  let pos = 0;
  while (pos < sql.length) {
    let matched = false;
    for (const [re, style] of HIGHLIGHT_RULES) {
      re.lastIndex = pos;
      const m = re.exec(sql);
      if (m && m.index === pos) {
        const safe = m[0].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        html += style ? `<span style="${style}">${safe}</span>` : safe;
        pos += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      html += sql[pos];
      pos++;
    }
  }
  return html;
}

function buildDefaultQuery(tableName: string): string {
  const parts = tableName.includes(".")
    ? tableName.split(".", 2)
    : ["dbo", tableName];
  return `SELECT TOP 100 * FROM ${quoteId(parts[0])}.${quoteId(parts[1])}`;
}

const SHARED_STYLE: React.CSSProperties = {
  fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
  fontSize: "13px",
  lineHeight: "1.6",
  padding: "10px 12px",
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  overflowWrap: "break-word",
};

export default function TableDataTab({ tableName }: TableDataTabProps) {
  const defaultSql = buildDefaultQuery(tableName);

  // Uncontrolled textarea — sqlRef always holds current value without triggering re-renders
  const sqlRef = useRef(defaultSql);
  const highlightedRef = useRef(highlightSQL(defaultSql) + " ");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const runQuery = useCallback(async () => {
    const sqlText = sqlRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlText, maxRows: 100 }),
        signal: controller.signal,
      });
      const data: QueryResult = await res.json();
      setResult(data);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setResult({
          columns: [],
          rows: [],
          rowCount: 0,
          durationMs: 0,
          truncated: false,
          error: (err as Error).message,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function updateHighlight(val: string) {
    const html = highlightSQL(val) + " ";
    highlightedRef.current = html;
    if (preRef.current) preRef.current.innerHTML = html;
  }

  // Sync highlight pre directly — no React state update, no re-render
  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const val = (e.target as HTMLTextAreaElement).value;
    sqlRef.current = val;
    updateHighlight(val);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = sqlRef.current.slice(0, start) + "  " + sqlRef.current.slice(end);
      sqlRef.current = next;
      ta.value = next;
      updateHighlight(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }

  useEffect(() => {
    runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      {/* Editor */}
      <div className="rounded-md border bg-zinc-950 overflow-hidden">
        <div style={{ position: "relative", minHeight: "3.5rem" }}>
          <pre
            ref={preRef}
            aria-hidden
            style={{
              ...SHARED_STYLE,
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              color: "#e2e8f0",
              zIndex: 0,
              overflow: "hidden",
            }}
            dangerouslySetInnerHTML={{ __html: highlightedRef.current }}
          />
          <textarea
            ref={textareaRef}
            defaultValue={defaultSql}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            rows={2}
            style={{
              ...SHARED_STYLE,
              position: "relative",
              zIndex: 1,
              display: "block",
              width: "100%",
              background: "transparent",
              color: "transparent",
              caretColor: "#e2e8f0",
              border: "none",
              outline: "none",
              resize: "vertical",
              minHeight: "3.5rem",
            }}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={runQuery}
          disabled={loading}
          className="gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Run
        </Button>
        <span className="text-xs text-muted-foreground">Ctrl+Enter</span>
      </div>

      {/* Results */}
      <ResultsTable result={result} loading={loading} resultSql={sqlRef.current} />
    </div>
  );
}
