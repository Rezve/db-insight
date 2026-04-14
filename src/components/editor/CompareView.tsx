"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  AlertTriangle,
  ChevronDown,
  GitCompare,
  Info,
  Pin,
  X,
} from "lucide-react";
import {
  parseStatistics,
  totalLogicalReads,
  totalPhysicalReads,
  LOGICAL_READS_WARN,
  DELTA_MATERIAL_PCT,
  IoStat,
} from "./statisticsUtils";
import { parsePlanXml } from "./queryPlanUtils";
import { diffPlans, PlanDiffRow } from "./planDiffUtils";

interface QueryResult {
  columns: { name: string; dataType: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
  error?: string;
  lineNumber?: number;
  statistics?: string[];
  planXml?: string;
}

interface CompareViewProps {
  current: QueryResult | null;
  previous: QueryResult | null;
  previousSql: string | null;
  baselinePinned: boolean;
  baselinePinnedAt: number | null;
  onUnpin: () => void;
}

type Verdict = "improved" | "regressed" | "unchanged" | "mixed";

interface VerdictResult {
  verdict: Verdict;
  reason: string;
}

function pctDelta(prev: number, curr: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

function fmtMs(ms: number): string {
  return `${ms.toLocaleString()} ms`;
}

function deltaClass(pct: number, lowerIsBetter = true): string {
  if (Math.abs(pct) < DELTA_MATERIAL_PCT) return "text-muted-foreground";
  const improved = lowerIsBetter ? pct < 0 : pct > 0;
  return improved
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
}

function signed(pct: number): string {
  const s = pct >= 0 ? "+" : "";
  return `${s}${pct.toFixed(0)}%`;
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.round(diffHr / 24)} d ago`;
}

function HelpPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 opacity-70 hover:opacity-100 transition-opacity"
        title="How Compare works"
        aria-label="How Compare works"
        aria-expanded={open}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute left-0 top-6 z-50 w-[360px] rounded-lg border bg-popover text-popover-foreground shadow-lg p-4 text-xs space-y-3"
        >
          <div>
            <p className="font-semibold text-sm mb-1">How Compare works</p>
            <p className="opacity-80 leading-relaxed">
              When Compare mode is on, each successful run is remembered as the
              baseline for the next run. The Compare tab diffs the two runs
              across statistics, CPU, and the execution plan.
            </p>
            <p className="opacity-80 leading-relaxed mt-2">
              Click <span className="font-semibold">Pin baseline</span> in the
              toolbar to freeze the current run as a sticky baseline. Subsequent
              runs will diff against it — useful when iterating an edit against
              the original query — until you unpin.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-1">Verdict signals (primary → advisory)</p>
            <ol className="list-decimal pl-4 space-y-1 opacity-90">
              <li>
                <span className="font-semibold">Logical reads</span> — pages touched by the
                engine. Fully deterministic; unaffected by network, cache, or server load.
                This is the primary signal.
              </li>
              <li>
                <span className="font-semibold">CPU time</span> (from STATISTICS TIME) —
                server-side work. Used when I/O is flat or stats aren&apos;t captured.
              </li>
              <li>
                <span className="font-semibold">Plan changes</span> — scan↔seek, new sort,
                new key lookup. Used as a tie-breaker, and can flip Improved → Mixed when
                the plan regressed under the hood.
              </li>
              <li>
                <span className="font-semibold">Physical reads</span> — advisory. Only
                flips Improved → Mixed when &gt; 10 pages of growth, to ignore cold-cache
                noise.
              </li>
              <li>
                <span className="font-semibold opacity-70">Wall-clock duration</span> —
                shown but never drives the verdict. Varies with network, server load, and
                cache state.
              </li>
            </ol>
          </div>

          <div>
            <p className="font-semibold mb-1">Verdict meanings</p>
            <ul className="space-y-1 opacity-90">
              <li>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Improved</span>
                {" — "}primary signal dropped by more than {DELTA_MATERIAL_PCT}%.
              </li>
              <li>
                <span className="text-red-600 dark:text-red-400 font-semibold">Regressed</span>
                {" — "}primary signal grew by more than {DELTA_MATERIAL_PCT}%.
              </li>
              <li>
                <span className="text-amber-600 dark:text-amber-400 font-semibold">Mixed</span>
                {" — "}signals disagree (e.g. fewer reads but plan regressed, or new
                physical reads).
              </li>
              <li>
                <span className="font-semibold">Unchanged</span>
                {" — "}work is effectively identical within the {DELTA_MATERIAL_PCT}% threshold.
              </li>
            </ul>
          </div>

          <p className="opacity-60 italic">
            Tip: enable Statistics and Query Plan for the richest comparison.
          </p>
        </div>
      )}
    </div>
  );
}

export default function CompareView({
  current,
  previous,
  previousSql,
  baselinePinned,
  baselinePinnedAt,
  onUnpin,
}: CompareViewProps) {
  const prevStats = useMemo(
    () => (previous?.statistics ? parseStatistics(previous.statistics) : null),
    [previous]
  );
  const currStats = useMemo(
    () => (current?.statistics ? parseStatistics(current.statistics) : null),
    [current]
  );

  const prevPlan = useMemo(
    () => (previous?.planXml ? parsePlanXml(previous.planXml) : null),
    [previous]
  );
  const currPlan = useMemo(
    () => (current?.planXml ? parsePlanXml(current.planXml) : null),
    [current]
  );

  const planDiff = useMemo(() => {
    if (!prevPlan && !currPlan) return null;
    return diffPlans(prevPlan, currPlan);
  }, [prevPlan, currPlan]);

  // Empty state
  if (!previous || !current) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-sm p-8 text-center">
        <GitCompare className="h-8 w-8 opacity-40" />
        <p>Run the query twice with Compare mode on to see a diff.</p>
        <p className="text-xs opacity-70">
          Enable Statistics and Query Plan for the richest comparison.
        </p>
      </div>
    );
  }

  if (previous.error || current.error) {
    return (
      <div className="p-4 space-y-3">
        <div className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm">
          <p className="font-semibold text-red-700 dark:text-red-300 mb-1">
            Cannot compare — one of the runs errored.
          </p>
          {previous.error && (
            <p className="text-xs">Previous: {previous.error}</p>
          )}
          {current.error && <p className="text-xs">Current: {current.error}</p>}
        </div>
      </div>
    );
  }

  const durPct = pctDelta(previous.durationMs, current.durationMs);
  const rowPct = pctDelta(previous.rowCount, current.rowCount);

  const prevLogical = prevStats ? totalLogicalReads(prevStats) : 0;
  const currLogical = currStats ? totalLogicalReads(currStats) : 0;
  const logicalPct = pctDelta(prevLogical, currLogical);
  const prevPhysical = prevStats ? totalPhysicalReads(prevStats) : 0;
  const currPhysical = currStats ? totalPhysicalReads(currStats) : 0;
  const prevScanCount = prevStats?.io.reduce((s, r) => s + r.scanCount, 0) ?? 0;
  const currScanCount = currStats?.io.reduce((s, r) => s + r.scanCount, 0) ?? 0;
  const prevCpuMs = prevStats?.time.reduce((s, r) => s + r.cpuMs, 0) ?? 0;
  const currCpuMs = currStats?.time.reduce((s, r) => s + r.cpuMs, 0) ?? 0;
  const cpuPct = pctDelta(prevCpuMs, currCpuMs);

  const verdictResult = classify({
    prevLogical,
    currLogical,
    logicalPct,
    prevCpuMs,
    currCpuMs,
    cpuPct,
    prevPhysical,
    currPhysical,
    durPct,
    planDiff,
    hasStats: (prevStats?.io.length ?? 0) > 0 || (currStats?.io.length ?? 0) > 0,
    hasCpu: prevCpuMs > 0 || currCpuMs > 0,
  });

  return (
    <div className="p-4 space-y-6">
      {/* Header summary */}
      <section>
        <HeaderCard
          verdictResult={verdictResult}
          durPct={durPct}
          prevDurationMs={previous.durationMs}
          currDurationMs={current.durationMs}
          rowPct={rowPct}
          prevRowCount={previous.rowCount}
          currRowCount={current.rowCount}
          prevLogical={prevLogical}
          currLogical={currLogical}
          prevCpuMs={prevCpuMs}
          currCpuMs={currCpuMs}
          prevPhysical={prevPhysical}
          currPhysical={currPhysical}
          prevScanCount={prevScanCount}
          currScanCount={currScanCount}
          baselinePinned={baselinePinned}
          baselinePinnedAt={baselinePinnedAt}
          onUnpin={onUnpin}
        />
        {previousSql && (
          <details className="mt-3 group">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground list-none">
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              {baselinePinned ? "Baseline query" : "Previous query"}
            </summary>
            <pre className="mt-2 rounded-lg border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap break-all">
              {previousSql}
            </pre>
          </details>
        )}
      </section>

      {/* Statistics diff */}
      {(prevStats || currStats) && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Statistics Delta
          </h3>
          <TimeDeltaGrid prev={prevStats} curr={currStats} />
          <IoDeltaTable
            prev={prevStats?.io ?? []}
            curr={currStats?.io ?? []}
          />
        </section>
      )}

      {/* Plan diff */}
      {planDiff && (
        <section>
          <PlanDiffSection diff={planDiff} />
        </section>
      )}
    </div>
  );
}

interface ClassifyInput {
  prevLogical: number;
  currLogical: number;
  logicalPct: number;
  prevCpuMs: number;
  currCpuMs: number;
  cpuPct: number;
  prevPhysical: number;
  currPhysical: number;
  durPct: number;
  planDiff: import("./planDiffUtils").PlanDiff | null;
  hasStats: boolean;
  hasCpu: boolean;
}

// Work-based verdict. Ordering of signals, most deterministic first:
//   1. Logical reads (pages touched — zero network noise).
//   2. CPU time (server work — zero network noise).
//   3. Plan category changes (scan↔seek, new sort / key lookup).
//   4. Physical reads — advisory only; cold-cache noise, only flips to "mixed"
//      if large enough to matter.
//   5. Wall-clock duration — shown but never drives the verdict.
function classify(input: ClassifyInput): VerdictResult {
  const {
    prevLogical,
    currLogical,
    logicalPct,
    prevCpuMs,
    currCpuMs,
    cpuPct,
    prevPhysical,
    currPhysical,
    durPct,
    planDiff,
    hasStats,
    hasCpu,
  } = input;

  const planRegressed = (planDiff?.regressionCount ?? 0) > 0;
  const planImproved = (planDiff?.improvementCount ?? 0) > 0;

  let base: Verdict = "unchanged";
  const drivers: string[] = [];

  // Primary — logical reads.
  if (hasStats && Math.abs(logicalPct) >= DELTA_MATERIAL_PCT) {
    base = logicalPct < 0 ? "improved" : "regressed";
    const delta = currLogical - prevLogical;
    drivers.push(
      `${signed(logicalPct)} logical reads (${delta >= 0 ? "+" : ""}${delta.toLocaleString()})`
    );
  } else if (hasCpu && Math.abs(cpuPct) >= DELTA_MATERIAL_PCT) {
    // Secondary — CPU time, deterministic on the server.
    base = cpuPct < 0 ? "improved" : "regressed";
    drivers.push(`${signed(cpuPct)} CPU time`);
  } else if (planDiff && planDiff.changedCount > 0) {
    // Tertiary — plan changes when I/O and CPU look flat.
    if (planImproved && !planRegressed) base = "improved";
    else if (planRegressed && !planImproved) base = "regressed";
    else if (planImproved && planRegressed) base = "mixed";
    drivers.push(
      `plan ${planDiff.improvementCount}↑ / ${planDiff.regressionCount}↓`
    );
  }

  // Mixed overlays — good primary signal undermined by something.
  if (base === "improved" && planRegressed) {
    base = "mixed";
    drivers.push("but plan regressed");
  }

  // Physical reads — only flag as mixed when meaningfully large, since a cold
  // cache easily produces phantom physical reads on otherwise-improved runs.
  const physDelta = currPhysical - prevPhysical;
  if (physDelta > 0 && physDelta >= 10 && base === "improved") {
    base = "mixed";
    drivers.push(`+${physDelta.toLocaleString()} physical reads (possible cold cache)`);
  }

  // Wall-clock advisory when nothing else fired.
  if (base === "unchanged" && Math.abs(durPct) >= DELTA_MATERIAL_PCT) {
    drivers.push(
      `duration ${signed(durPct)} — unchanged work, likely network or cache noise`
    );
  }

  if (!hasStats && !hasCpu && !planDiff) {
    return {
      verdict: "unchanged",
      reason:
        "No statistics or plan captured — enable Statistics / Query Plan for a meaningful verdict.",
    };
  }

  const reason = drivers.length > 0 ? drivers.join(" · ") : "Work is identical.";
  return { verdict: base, reason };
}

function HeaderCard({
  verdictResult,
  durPct,
  prevDurationMs,
  currDurationMs,
  rowPct,
  prevRowCount,
  currRowCount,
  prevLogical,
  currLogical,
  prevCpuMs,
  currCpuMs,
  prevPhysical,
  currPhysical,
  prevScanCount,
  currScanCount,
  baselinePinned,
  baselinePinnedAt,
  onUnpin,
}: {
  verdictResult: VerdictResult;
  durPct: number;
  prevDurationMs: number;
  currDurationMs: number;
  rowPct: number;
  prevRowCount: number;
  currRowCount: number;
  prevLogical: number;
  currLogical: number;
  prevCpuMs: number;
  currCpuMs: number;
  prevPhysical: number;
  currPhysical: number;
  prevScanCount: number;
  currScanCount: number;
  baselinePinned: boolean;
  baselinePinnedAt: number | null;
  onUnpin: () => void;
}) {
  const { verdict, reason } = verdictResult;
  const logicalDelta = currLogical - prevLogical;
  const cpuDelta = currCpuMs - prevCpuMs;
  const physicalDelta = currPhysical - prevPhysical;
  const scanDelta = currScanCount - prevScanCount;
  const verdictMeta = {
    improved: {
      label: "Improved",
      color: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-900",
      icon: <TrendingDown className="h-4 w-4" />,
    },
    regressed: {
      label: "Regressed",
      color: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-900",
      icon: <TrendingUp className="h-4 w-4" />,
    },
    unchanged: {
      label: "Unchanged",
      color: "bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-800",
      icon: <Minus className="h-4 w-4" />,
    },
    mixed: {
      label: "Mixed",
      color: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-900",
      icon: <AlertTriangle className="h-4 w-4" />,
    },
  }[verdict];

  return (
    <div className={`rounded-lg border p-4 ${verdictMeta.color}`}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {verdictMeta.icon}
        <span className="font-semibold text-sm">{verdictMeta.label}</span>
        <HelpPopover />
        {baselinePinned && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-current/30 bg-white/40 dark:bg-black/20 px-2 py-0.5 text-[11px] font-medium">
            <Pin className="h-3 w-3" />
            Pinned baseline
            {baselinePinnedAt && (
              <span className="opacity-70">· {formatRelativeTime(baselinePinnedAt)}</span>
            )}
            <button
              type="button"
              onClick={onUnpin}
              className="ml-0.5 rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
              title="Unpin baseline"
              aria-label="Unpin baseline"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
      <p className="text-xs opacity-80 mb-3">{reason}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {(prevLogical > 0 || currLogical > 0) && (
          <Metric
            label="Logical reads (total)"
            from={prevLogical.toLocaleString()}
            to={currLogical.toLocaleString()}
            deltaLabel={`${logicalDelta >= 0 ? "+" : ""}${logicalDelta.toLocaleString()}`}
            deltaClass={deltaClass(logicalDelta)}
          />
        )}
        {(prevCpuMs > 0 || currCpuMs > 0) && (
          <Metric
            label="CPU time (total)"
            from={fmtMs(prevCpuMs)}
            to={fmtMs(currCpuMs)}
            deltaLabel={`${cpuDelta >= 0 ? "+" : ""}${cpuDelta.toLocaleString()} ms`}
            deltaClass={deltaClass(cpuDelta)}
          />
        )}
        <Metric
          label="Duration (advisory)"
          from={fmtMs(prevDurationMs)}
          to={fmtMs(currDurationMs)}
          deltaLabel={signed(durPct)}
          deltaClass="text-muted-foreground"
        />
        <Metric
          label="Rows"
          from={prevRowCount.toLocaleString()}
          to={currRowCount.toLocaleString()}
          deltaLabel={Math.abs(rowPct) >= DELTA_MATERIAL_PCT ? signed(rowPct) : "—"}
          deltaClass="text-muted-foreground"
        />
        {(prevPhysical > 0 || currPhysical > 0) && (
          <Metric
            label="Physical reads (total)"
            from={prevPhysical.toLocaleString()}
            to={currPhysical.toLocaleString()}
            deltaLabel={`${physicalDelta >= 0 ? "+" : ""}${physicalDelta.toLocaleString()}`}
            deltaClass={deltaClass(physicalDelta)}
          />
        )}
        {(prevScanCount > 0 || currScanCount > 0) && (
          <Metric
            label="Scan count (total)"
            from={prevScanCount.toLocaleString()}
            to={currScanCount.toLocaleString()}
            deltaLabel={`${scanDelta >= 0 ? "+" : ""}${scanDelta.toLocaleString()}`}
            deltaClass={deltaClass(scanDelta)}
          />
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  from,
  to,
  deltaLabel,
  deltaClass,
}: {
  label: string;
  from: string;
  to: string;
  deltaLabel: string;
  deltaClass: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wider opacity-70">{label}</p>
      <div className="flex items-center gap-1.5 font-mono text-sm">
        <span className="opacity-70">{from}</span>
        <ArrowRight className="h-3 w-3 opacity-50" />
        <span className="font-semibold">{to}</span>
      </div>
      <p className={`text-xs font-mono ${deltaClass}`}>{deltaLabel}</p>
    </div>
  );
}

function TimeDeltaGrid({
  prev,
  curr,
}: {
  prev: ReturnType<typeof parseStatistics> | null;
  curr: ReturnType<typeof parseStatistics> | null;
}) {
  const labels = new Set<string>();
  prev?.time.forEach((t) => labels.add(t.label));
  curr?.time.forEach((t) => labels.add(t.label));
  if (labels.size === 0) return null;

  const cards = Array.from(labels).map((label) => {
    const p = prev?.time.find((t) => t.label === label);
    const c = curr?.time.find((t) => t.label === label);
    const prevCpu = p?.cpuMs ?? 0;
    const currCpu = c?.cpuMs ?? 0;
    const prevEl = p?.elapsedMs ?? 0;
    const currEl = c?.elapsedMs ?? 0;
    const cpuPct = pctDelta(prevCpu, currCpu);
    const elPct = pctDelta(prevEl, currEl);
    return (
      <div key={label} className="rounded-lg border p-4 bg-zinc-50 dark:bg-zinc-900">
        <p className="text-xs font-medium text-muted-foreground mb-3">{label}</p>
        <div className="space-y-2">
          <TimeRow label="CPU" prev={prevCpu} curr={currCpu} pct={cpuPct} />
          <TimeRow label="Elapsed" prev={prevEl} curr={currEl} pct={elPct} />
        </div>
      </div>
    );
  });

  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">{cards}</div>;
}

function TimeRow({
  label,
  prev,
  curr,
  pct,
}: {
  label: string;
  prev: number;
  curr: number;
  pct: number;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 font-mono tabular-nums">
        <span className="opacity-70">{prev.toLocaleString()}</span>
        <ArrowRight className="h-3 w-3 opacity-50" />
        <span className="font-semibold">{curr.toLocaleString()} ms</span>
        <span className={`ml-1 ${deltaClass(pct)}`}>
          {Math.abs(pct) < DELTA_MATERIAL_PCT ? "—" : signed(pct)}
        </span>
      </div>
    </div>
  );
}

function IoDeltaTable({ prev, curr }: { prev: IoStat[]; curr: IoStat[] }) {
  const tables = new Set<string>();
  prev.forEach((r) => tables.add(r.table));
  curr.forEach((r) => tables.add(r.table));
  if (tables.size === 0) return null;

  const rows = Array.from(tables).map((table) => {
    const p = prev.find((r) => r.table === table);
    const c = curr.find((r) => r.table === table);
    return { table, prev: p, curr: c };
  });

  rows.sort((a, b) => {
    const da = Math.abs((a.curr?.logicalReads ?? 0) - (a.prev?.logicalReads ?? 0));
    const db = Math.abs((b.curr?.logicalReads ?? 0) - (b.prev?.logicalReads ?? 0));
    return db - da;
  });

  return (
    <div className="rounded-lg border overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-zinc-50 dark:bg-zinc-900 border-b">
          <tr>
            {["Table", "Status", "Scan Count", "Logical Reads", "Physical Reads", "LOB Logical"].map((h) => (
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
          {rows.map((r, i) => {
            const status = !r.prev ? "new" : !r.curr ? "removed" : "changed";
            const removed = status === "removed";
            return (
              <tr
                key={i}
                className={`border-b last:border-b-0 ${removed ? "opacity-60" : ""}`}
              >
                <td className={`px-3 py-2 font-mono text-xs font-medium border-r ${removed ? "line-through" : ""}`}>
                  {r.table}
                </td>
                <td className="px-3 py-2 text-xs border-r">
                  {status === "new" && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-semibold">
                      NEW
                    </span>
                  )}
                  {status === "removed" && (
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 text-[10px] font-semibold">
                      REMOVED
                    </span>
                  )}
                  {status === "changed" && (
                    <span className="text-[10px] text-muted-foreground">changed</span>
                  )}
                </td>
                <DeltaCell prev={r.prev?.scanCount} curr={r.curr?.scanCount} />
                <DeltaCell
                  prev={r.prev?.logicalReads}
                  curr={r.curr?.logicalReads}
                  warnThreshold={LOGICAL_READS_WARN}
                />
                <DeltaCell
                  prev={r.prev?.physicalReads}
                  curr={r.curr?.physicalReads}
                  physicalHighlight
                />
                <DeltaCell prev={r.prev?.lobLogicalReads} curr={r.curr?.lobLogicalReads} />
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] text-muted-foreground border-t">
        Sorted by largest logical-reads delta. Green = improvement, red = regression.
      </p>
    </div>
  );
}

function DeltaCell({
  prev,
  curr,
  warnThreshold,
  physicalHighlight,
}: {
  prev?: number;
  curr?: number;
  warnThreshold?: number;
  physicalHighlight?: boolean;
}) {
  const p = prev ?? 0;
  const c = curr ?? 0;
  const delta = c - p;
  let colour = "text-muted-foreground";
  if (delta < 0) colour = "text-emerald-600 dark:text-emerald-400";
  else if (delta > 0) colour = "text-red-600 dark:text-red-400";
  if (physicalHighlight && c > 0) colour = "text-red-600 dark:text-red-400 font-semibold";

  const warn = warnThreshold && c > warnThreshold ? " font-semibold" : "";

  return (
    <td className="px-3 py-2 font-mono text-xs text-right border-r">
      <div className="flex items-center justify-end gap-1">
        <span className="opacity-70">{p.toLocaleString()}</span>
        <ArrowRight className="h-3 w-3 opacity-40" />
        <span className={warn}>{c.toLocaleString()}</span>
        {delta !== 0 && (
          <span className={`ml-1 ${colour}`}>
            ({delta > 0 ? "+" : ""}
            {delta.toLocaleString()})
          </span>
        )}
      </div>
    </td>
  );
}

function PlanDiffSection({ diff }: { diff: ReturnType<typeof diffPlans> }) {
  const changedRows = diff.rows.filter((r) => r.status !== "same");
  const sameRows = diff.rows.filter((r) => r.status === "same");

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Plan Changes
      </h3>
      {diff.changedCount === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border p-4 bg-zinc-50 dark:bg-zinc-900">
          Plan is identical between runs.
        </p>
      ) : (
        <>
          <p className="text-sm mb-3">
            {diff.changedCount} operation{diff.changedCount !== 1 ? "s" : ""} changed
            {diff.improvementCount > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">
                {" "}
                · {diff.improvementCount} improvement{diff.improvementCount !== 1 ? "s" : ""}
              </span>
            )}
            {diff.regressionCount > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {" "}
                · {diff.regressionCount} regression{diff.regressionCount !== 1 ? "s" : ""}
              </span>
            )}
            .
          </p>
          <div className="space-y-2">
            {changedRows.map((r, i) => (
              <DiffRow key={i} row={r} />
            ))}
          </div>
        </>
      )}

      {sameRows.length > 0 && (
        <details className="mt-4 group">
          <summary className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground list-none">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            Unchanged operations ({sameRows.length})
          </summary>
          <div className="mt-2 space-y-1">
            {sameRows.map((r, i) => (
              <div key={i} className="text-xs font-mono text-muted-foreground px-3 py-1">
                {r.curr?.physicalOp}
                {r.curr?.table ? ` on [${r.curr.table}]` : ""}
                {r.curr?.index ? ` via [${r.curr.index}]` : ""}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function DiffRow({ row }: { row: PlanDiffRow }) {
  const borderColour =
    row.verdict === "improvement"
      ? "border-l-emerald-500"
      : row.verdict === "regression"
      ? "border-l-red-500"
      : "border-l-amber-500";

  return (
    <div className={`rounded-lg border border-l-4 ${borderColour} bg-zinc-50 dark:bg-zinc-900`}>
      <div className="grid grid-cols-2 divide-x">
        <NodeSide node={row.prev} status={row.status === "added" ? "empty" : "filled"} label="Previous" />
        <NodeSide node={row.curr} status={row.status === "removed" ? "empty" : "filled"} label="Current" />
      </div>
      {row.changes.length > 0 && (
        <div className="border-t px-3 py-2 space-y-1">
          {row.changes.map((c, i) => (
            <p key={i} className="text-xs font-mono">
              {c}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function NodeSide({
  node,
  status,
  label,
}: {
  node?: import("./queryPlanUtils").PlanNode;
  status: "empty" | "filled";
  label: string;
}) {
  if (status === "empty" || !node) {
    return (
      <div className="p-3 text-xs text-muted-foreground italic">
        {label}: —
      </div>
    );
  }
  return (
    <div className="p-3 space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-mono font-semibold">{node.physicalOp}</p>
      {node.table && (
        <p className="text-xs font-mono text-muted-foreground">
          [{node.table}]{node.index ? ` · ${node.index}` : ""}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {node.costPercent.toFixed(0)}% cost · {Math.round(node.estimateRows).toLocaleString()} est. rows
      </p>
      {node.warnings.length > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {node.warnings.join("; ")}
        </p>
      )}
    </div>
  );
}
