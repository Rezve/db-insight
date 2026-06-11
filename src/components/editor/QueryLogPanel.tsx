"use client";

import React, { useCallback, useEffect, useMemo, useRef, memo } from "react";
import { Trash2 } from "lucide-react";
import { tokenize, type TokenKind } from "@/lib/sql-intellisense";
import type { QueryLogEntry } from "@/types/db";

interface QueryLogPanelProps {
  logs: QueryLogEntry[];
  onClear: () => void;
}

const TOKEN_COLORS: Record<TokenKind, string> = {
  keyword:    "text-blue-400",
  string:     "text-amber-300",
  number:     "text-green-400",
  identifier: "text-neutral-100",
  comment:    "text-neutral-500 italic",
  operator:   "text-neutral-300",
  punct:      "text-neutral-400",
  dot:        "text-neutral-400",
  comma:      "text-neutral-400",
  lparen:     "text-neutral-400",
  rparen:     "text-neutral-400",
  semicolon:  "text-neutral-400",
  go:         "text-blue-400",
};

const HighlightedSql = memo(function HighlightedSql({ sql }: { sql: string }) {
  const parts = useMemo(() => {
    const tokens = tokenize(sql);
    const result: React.ReactNode[] = [];
    let cursor = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.start > cursor) {
        result.push(sql.slice(cursor, tok.start));
      }
      result.push(
        <span key={i} className={TOKEN_COLORS[tok.kind] ?? "text-neutral-100"}>
          {tok.raw}
        </span>
      );
      cursor = tok.end;
    }
    if (cursor < sql.length) {
      result.push(sql.slice(cursor));
    }
    return result;
  }, [sql]);

  return <>{parts}</>;
});

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = Math.floor(ms / 1000);
  const rem = ms % 1000;
  return rem > 0 ? `${s} s ${rem} ms` : `${s} s`;
}

function fmtTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

const LogEntry = memo(function LogEntry({ entry }: { entry: QueryLogEntry }) {
  return (
    <div className="border-b border-neutral-800 py-2 px-3 select-text">
      <div className="leading-relaxed whitespace-pre-wrap break-words">
        <span className="text-neutral-500">{entry.dbName}&gt; </span>
        <HighlightedSql sql={entry.sql} />
      </div>
      {entry.error ? (
        <div className="mt-0.5 text-red-400 leading-relaxed">{entry.error}</div>
      ) : (
        <div className="mt-0.5 text-neutral-500 leading-relaxed">
          [{fmtTimestamp(entry.timestamp)}]{" "}
          {entry.rowCount} row{entry.rowCount !== 1 ? "s" : ""} retrieved starting from 1 in{" "}
          {fmtMs(entry.totalMs)}{" "}
          (execution: {fmtMs(entry.executionMs)}, fetching: {fmtMs(entry.fetchingMs)})
        </div>
      )}
    </div>
  );
});

export default function QueryLogPanel({ logs, onClear }: QueryLogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
  }, []);

  return (
    <div className="h-full flex flex-col bg-neutral-950 text-neutral-200 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-800 shrink-0">
        <span className="text-neutral-400 text-[11px] font-medium tracking-wide">Query Log</span>
        {logs.length > 0 && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 text-neutral-500 hover:text-neutral-300 transition-colors px-1.5 py-0.5 rounded hover:bg-neutral-800"
            title="Clear log"
          >
            <Trash2 className="h-3 w-3" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Log entries — will-change promotes to compositor layer for smooth scrolling */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        style={{ willChange: "scroll-position" }}
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-neutral-600 select-none">
            No queries logged yet
          </div>
        ) : (
          logs.map((entry) => <LogEntry key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
