// Shared parsing utilities for SQL Server STATISTICS IO / STATISTICS TIME messages.
// Used by StatisticsPanel (single-run view) and CompareView (two-run diff).

export interface IoStat {
  table: string;
  scanCount: number;
  logicalReads: number;
  physicalReads: number;
  readAheadReads: number;
  lobLogicalReads: number;
  lobPhysicalReads: number;
  lobReadAheadReads: number;
}

export interface TimeStat {
  label: string;
  cpuMs: number;
  elapsedMs: number;
}

export interface ParsedStatistics {
  io: IoStat[];
  time: TimeStat[];
  raw: string[];
}

// Thresholds shared by single-run and compare views.
export const LOGICAL_READS_WARN = 1000;
export const ELAPSED_MS_WARN = 1000;
// Percent change above which a delta is considered "material" (green/red).
export const DELTA_MATERIAL_PCT = 5;

export function parseStatistics(messages: string[]): ParsedStatistics {
  const io: IoStat[] = [];
  const time: TimeStat[] = [];
  const raw: string[] = [];

  const ioPattern =
    /Table '([^']+)'\.\s*Scan count (\d+),\s*logical reads (\d+),\s*physical reads (\d+),(?:[^,]*,)?\s*read-ahead reads (\d+),(?:[^,]*,)?\s*lob logical reads (\d+),\s*lob physical reads (\d+),(?:[^,]*,)?\s*lob read-ahead reads (\d+)/i;

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

    if (normalized && !normalized.match(/^SQL Server (parse and compile time|Execution Times)/i)) {
      raw.push(normalized);
    }
  }

  return { io, time, raw };
}

// Aggregate the "Execution" row (falling back to first time entry) — used as a
// single comparable number when we want one timing signal per run.
export function totalExecutionMs(stats: ParsedStatistics): { cpuMs: number; elapsedMs: number } | null {
  const exec = stats.time.find((t) => t.label === "Execution") ?? stats.time[0];
  if (!exec) return null;
  return { cpuMs: exec.cpuMs, elapsedMs: exec.elapsedMs };
}

export function totalLogicalReads(stats: ParsedStatistics): number {
  return stats.io.reduce((sum, r) => sum + r.logicalReads, 0);
}

export function totalPhysicalReads(stats: ParsedStatistics): number {
  return stats.io.reduce((sum, r) => sum + r.physicalReads, 0);
}
