"use client";

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";

interface IoStat {
  table: string;
  scanCount: number;
  logicalReads: number;
  physicalReads: number;
  readAheadReads: number;
  lobLogicalReads: number;
  lobPhysicalReads: number;
  lobReadAheadReads: number;
}

interface TimeStat {
  label: string;
  cpuMs: number;
  elapsedMs: number;
}

interface ParsedStatistics {
  io: IoStat[];
  time: TimeStat[];
  raw: string[];
}

function parseStatistics(messages: string[]): ParsedStatistics {
  const io: IoStat[] = [];
  const time: TimeStat[] = [];
  const raw: string[] = [];

  // Regex for STATISTICS IO lines
  // "Table 'Name'. Scan count N, logical reads N, physical reads N, ..."
  const ioPattern =
    /Table '([^']+)'\.\s*Scan count (\d+),\s*logical reads (\d+),\s*physical reads (\d+),(?:[^,]*,)?\s*read-ahead reads (\d+),(?:[^,]*,)?\s*lob logical reads (\d+),\s*lob physical reads (\d+),(?:[^,]*,)?\s*lob read-ahead reads (\d+)/i;

  // Regex for STATISTICS TIME CPU/elapsed pairs
  // "CPU time = N ms,  elapsed time = N ms"
  const cpuPattern = /CPU time = (\d+) ms,\s*elapsed time = (\d+) ms/i;
  const parseCompilePattern = /SQL Server parse and compile time/i;
  const executionTimesPattern = /SQL Server Execution Times/i;

  for (const msg of messages) {
    const normalized = msg.replace(/\r\n/g, "\n").trim();

    const ioMatch = normalized.match(ioPattern);
    if (ioMatch) {
      io.push({
        table: ioMatch[1],
        scanCount: parseInt(ioMatch[2], 10),
        logicalReads: parseInt(ioMatch[3], 10),
        physicalReads: parseInt(ioMatch[4], 10),
        readAheadReads: parseInt(ioMatch[5], 10),
        lobLogicalReads: parseInt(ioMatch[6], 10),
        lobPhysicalReads: parseInt(ioMatch[7], 10),
        lobReadAheadReads: parseInt(ioMatch[8], 10),
      });
      continue;
    }

    const cpuMatch = normalized.match(cpuPattern);
    if (cpuMatch) {
      const cpuMs = parseInt(cpuMatch[1], 10);
      const elapsedMs = parseInt(cpuMatch[2], 10);
      if (parseCompilePattern.test(normalized)) {
        time.push({ label: "Parse & Compile", cpuMs, elapsedMs });
      } else if (executionTimesPattern.test(normalized)) {
        time.push({ label: "Execution", cpuMs, elapsedMs });
      } else {
        time.push({ label: "SQL Server", cpuMs, elapsedMs });
      }
      continue;
    }

    // Collect unparsed messages that aren't just whitespace or SQL Server boilerplate
    if (normalized && !normalized.match(/^SQL Server (parse and compile time|Execution Times)/i)) {
      raw.push(normalized);
    }
  }

  return { io, time, raw };
}

interface StatisticsPanelProps {
  messages: string[];
}

export default function StatisticsPanel({ messages }: StatisticsPanelProps) {
  const stats = useMemo(() => parseStatistics(messages), [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
        No statistics data — add{" "}
        <code className="mx-1 px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
          SET STATISTICS IO ON; SET STATISTICS TIME ON
        </code>{" "}
        to your query
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* I/O Statistics */}
      {stats.io.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            I/O Statistics
          </h3>
          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-zinc-50 dark:bg-zinc-900 border-b">
                <tr>
                  {[
                    "Table",
                    "Scan Count",
                    "Logical Reads",
                    "Physical Reads",
                    "Read-ahead Reads",
                    "LOB Logical",
                    "LOB Physical",
                    "LOB Read-ahead",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 font-medium text-xs text-muted-foreground whitespace-nowrap border-r last:border-r-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.io.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <td className="px-3 py-2 font-mono text-xs font-medium border-r">{row.table}</td>
                    <td className="px-3 py-2 font-mono text-xs text-right border-r">{row.scanCount.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-xs text-right border-r">
                      <span className={row.logicalReads > 1000 ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>
                        {row.logicalReads.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-right border-r">
                      <span className={row.physicalReads > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}>
                        {row.physicalReads.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-right border-r text-muted-foreground">{row.readAheadReads.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-xs text-right border-r text-muted-foreground">{row.lobLogicalReads.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-xs text-right border-r text-muted-foreground">{row.lobPhysicalReads.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-xs text-right text-muted-foreground">{row.lobReadAheadReads.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            <span className="text-amber-600 dark:text-amber-400 font-semibold">Amber</span> = logical reads &gt; 1,000 &nbsp;·&nbsp;
            <span className="text-red-600 dark:text-red-400 font-semibold">Red</span> = physical reads &gt; 0 (disk I/O)
          </p>
        </section>
      )}

      {/* Execution Time */}
      {stats.time.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Execution Time
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.time.map((t, i) => (
              <div key={i} className="rounded-lg border p-4 bg-zinc-50 dark:bg-zinc-900">
                <p className="text-xs font-medium text-muted-foreground mb-3">{t.label}</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">CPU time</span>
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {t.cpuMs.toLocaleString()} ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Elapsed time</span>
                    <span className={`font-mono text-sm font-semibold tabular-nums ${t.elapsedMs > 1000 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                      {t.elapsedMs.toLocaleString()} ms
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Raw / unparsed messages */}
      {stats.raw.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors list-none">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            Raw messages ({stats.raw.length})
          </summary>
          <div className="mt-2 rounded-lg border bg-muted/40 p-3 space-y-1">
            {stats.raw.map((msg, i) => (
              <pre key={i} className="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground">
                {msg}
              </pre>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
