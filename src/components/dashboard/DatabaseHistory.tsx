"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AreaChart, Area, LineChart, Line, ComposedChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { History, TrendingUp, TrendingDown, Minus, Server, Database } from "lucide-react";
import type { SnapshotRow } from "@/lib/stats-db";

interface HistoryResponse {
  serverName: string;
  databaseName: string;
  snapshots: SnapshotRow[];
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatSize(gb: number): string {
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  if (gb * 1024 >= 1) return `${(gb * 1024).toFixed(1)} MB`;
  return `${(gb * 1024 * 1024).toFixed(0)} KB`;
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Time range filtering ──────────────────────────────────────────────────────

function filterByDays(snapshots: SnapshotRow[], days: number): SnapshotRow[] {
  if (days === 90) return snapshots;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return snapshots.filter((s) => s.snapshot_date >= cutoffStr);
}

// ── Nearest snapshot helper for comparison table ──────────────────────────────

function findNearestBefore(snapshots: SnapshotRow[], daysAgo: number): SnapshotRow | null {
  const target = new Date();
  target.setDate(target.getDate() - daysAgo);
  const targetStr = target.toISOString().slice(0, 10);
  const candidates = snapshots.filter((s) => s.snapshot_date <= targetStr);
  return candidates[candidates.length - 1] ?? null;
}

// ── Chart shared styles ───────────────────────────────────────────────────────

const COLORS = {
  primary:  "hsl(var(--primary))",
  blue:     "#3b82f6",
  amber:    "#f59e0b",
  green:    "#22c55e",
  red:      "#ef4444",
  purple:   "#a855f7",
  pink:     "#ec4899",
};

const gridProps = { strokeDasharray: "3 3", stroke: "hsl(var(--border))" };
const tooltipStyle: React.CSSProperties = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 6,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{children}</h2>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {children}
      </CardContent>
    </Card>
  );
}

function InsufficientData() {
  return (
    <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
      At least 2 snapshots needed to show trends. Come back tomorrow.
    </div>
  );
}

// ── Comparison table ──────────────────────────────────────────────────────────

interface MetricDef {
  label: string;
  key: keyof SnapshotRow;
  format: (v: number) => string;
  higherIsBetter: boolean | null; // null = neutral
}

const METRICS: MetricDef[] = [
  // Storage
  { label: "Total Size",             key: "total_size_gb",           format: formatSize,  higherIsBetter: false },
  { label: "Data Size",              key: "data_size_gb",            format: formatSize,  higherIsBetter: null  },
  { label: "Index Size",             key: "index_size_gb",           format: formatSize,  higherIsBetter: null  },
  // Activity
  { label: "Approx. Total Rows",     key: "total_rows",              format: formatNum,   higherIsBetter: null  },
  { label: "Index Seeks",            key: "total_seeks",             format: formatNum,   higherIsBetter: true  },
  { label: "Index Scans",            key: "total_scans",             format: formatNum,   higherIsBetter: null  },
  // Index Health
  { label: "Total Indexes",          key: "total_indexes",           format: formatNum,   higherIsBetter: null  },
  { label: "Disabled Indexes",       key: "disabled_indexes",        format: formatNum,   higherIsBetter: false },
  { label: "Unused Indexes",         key: "unused_index_count",      format: formatNum,   higherIsBetter: false },
  { label: "Missing Suggestions",    key: "missing_index_count",     format: formatNum,   higherIsBetter: false },
  // Schema Health
  { label: "Tables",                 key: "table_count",             format: formatNum,   higherIsBetter: null  },
  { label: "Views",                  key: "view_count",              format: formatNum,   higherIsBetter: null  },
  { label: "Stored Procedures",      key: "procedure_count",         format: formatNum,   higherIsBetter: null  },
  { label: "Functions",              key: "function_count",          format: formatNum,   higherIsBetter: null  },
  { label: "Total Columns",          key: "total_column_count",      format: formatNum,   higherIsBetter: null  },
  { label: "Foreign Keys",           key: "foreign_key_count",       format: formatNum,   higherIsBetter: null  },
];

function DeltaIndicator({ current, baseline, higherIsBetter }: {
  current: number;
  baseline: number | null;
  higherIsBetter: boolean | null;
}) {
  if (baseline === null) return <span className="text-muted-foreground">—</span>;
  const diff = current - baseline;
  if (diff === 0) return <Minus className="h-3.5 w-3.5 inline text-muted-foreground" />;

  const improved =
    higherIsBetter === null ? null :
    higherIsBetter ? diff > 0 : diff < 0;

  const color = improved === null ? "text-muted-foreground" : improved ? "text-green-500" : "text-red-500";
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return <Icon className={`h-3.5 w-3.5 inline ${color}`} />;
}

function ComparisonTable({ snapshots }: { snapshots: SnapshotRow[] }) {
  const today     = snapshots[snapshots.length - 1];
  const yesterday = findNearestBefore(snapshots, 1);
  const week      = findNearestBefore(snapshots, 7);
  const month     = findNearestBefore(snapshots, 30);

  const sections: { heading: string; metrics: MetricDef[] }[] = [
    { heading: "Storage",       metrics: METRICS.slice(0, 3) },
    { heading: "Activity",      metrics: METRICS.slice(3, 6) },
    { heading: "Index Health",  metrics: METRICS.slice(6, 10) },
    { heading: "Schema Health", metrics: METRICS.slice(10) },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
            <th className="text-left py-2 pr-4 font-medium w-44">Metric</th>
            <th className="text-right py-2 px-3 font-medium">Today<br /><span className="text-[10px] font-normal">{fmtDate(today.snapshot_date)}</span></th>
            <th className="text-right py-2 px-3 font-medium">Yesterday<br /><span className="text-[10px] font-normal">{yesterday ? fmtDate(yesterday.snapshot_date) : "—"}</span></th>
            <th className="text-right py-2 px-3 font-medium">7d Ago<br /><span className="text-[10px] font-normal">{week ? fmtDate(week.snapshot_date) : "—"}</span></th>
            <th className="text-right py-2 pl-3 font-medium">30d Ago<br /><span className="text-[10px] font-normal">{month ? fmtDate(month.snapshot_date) : "—"}</span></th>
          </tr>
        </thead>
        <tbody>
          {sections.map(({ heading, metrics }) => (
            <React.Fragment key={heading}>
              <tr className="border-t border-dashed">
                <td colSpan={5} className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{heading}</td>
              </tr>
              {metrics.map((m) => {
                const todayVal     = today[m.key] as number;
                const ydayVal      = yesterday ? yesterday[m.key] as number : null;
                const weekVal      = week      ? week[m.key]      as number : null;
                const monthVal     = month     ? month[m.key]     as number : null;

                return (
                  <tr key={m.key} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-1.5 pr-4 text-foreground">{m.label}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums font-medium">{m.format(todayVal)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                      {ydayVal !== null ? m.format(ydayVal) : "—"}
                      {" "}<DeltaIndicator current={todayVal} baseline={ydayVal} higherIsBetter={m.higherIsBetter} />
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                      {weekVal !== null ? m.format(weekVal) : "—"}
                      {" "}<DeltaIndicator current={todayVal} baseline={weekVal} higherIsBetter={m.higherIsBetter} />
                    </td>
                    <td className="py-1.5 pl-3 text-right tabular-nums text-muted-foreground">
                      {monthVal !== null ? m.format(monthVal) : "—"}
                      {" "}<DeltaIndicator current={todayVal} baseline={monthVal} higherIsBetter={m.higherIsBetter} />
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DatabaseHistory() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json as HistoryResponse);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Failed to load history: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-[220px]" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const { serverName, databaseName, snapshots } = data;

  // ── Empty state ──────────────────────────────────────────────────────────
  if (snapshots.length === 0) {
    return (
      <Card className="max-w-md mx-auto mt-12">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <History className="h-10 w-10 text-muted-foreground" />
          <p className="font-semibold">No history yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Snapshots save automatically the first time you view the Summary tab each day. Check back tomorrow to see trends.
          </p>
          <Link href="/dashboard" className="text-sm text-primary hover:underline">
            Go to Summary
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Server context */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><Server className="h-3.5 w-3.5" />{serverName}</span>
        <span className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" />{databaseName}</span>
        <span>{snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""} stored</span>
      </div>

      {/* Time range tabs */}
      <Tabs defaultValue="30d">
        <TabsList>
          <TabsTrigger value="7d">7d</TabsTrigger>
          <TabsTrigger value="30d">30d</TabsTrigger>
          <TabsTrigger value="90d">90d</TabsTrigger>
        </TabsList>

        {(["7d", "30d", "90d"] as const).map((range) => {
          const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
          const filtered = filterByDays(snapshots, days);
          const hasEnough = filtered.length >= 2;

          // Recharts needs plain objects — map snapshot_date to display label
          const chartData = filtered.map((s) => ({
            ...s,
            date: fmtDate(s.snapshot_date),
          }));

          return (
            <TabsContent key={range} value={range} className="space-y-6 mt-4">
              {/* Storage */}
              <div>
                <SectionHeading>Storage</SectionHeading>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ChartCard title="Database Size (GB)">
                    {!hasEnough ? <InsufficientData /> : (
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={chartData}>
                          <CartesianGrid {...gridProps} />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatSize(v)} width={60} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatSize(v)} />
                          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                          <Area type="monotone" dataKey="total_size_gb" name="Total"  stroke={COLORS.primary} fill={COLORS.primary} fillOpacity={0.15} dot={false} />
                          <Area type="monotone" dataKey="data_size_gb"  name="Data"   stroke={COLORS.blue}    fill={COLORS.blue}    fillOpacity={0.10} dot={false} />
                          <Area type="monotone" dataKey="index_size_gb" name="Indexes" stroke={COLORS.amber}   fill={COLORS.amber}   fillOpacity={0.10} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  <ChartCard title="Total Rows (approx.)">
                    {!hasEnough ? <InsufficientData /> : (
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={chartData}>
                          <CartesianGrid {...gridProps} />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNum(v)} width={70} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatNum(v)} />
                          <Line type="monotone" dataKey="total_rows" name="Total Rows" stroke={COLORS.blue} dot={false} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </div>

              {/* Index Health */}
              <div>
                <SectionHeading>Index Health</SectionHeading>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ChartCard title="Index Count vs. Health Issues">
                    {!hasEnough ? <InsufficientData /> : (
                      <ResponsiveContainer width="100%" height={220}>
                        <ComposedChart data={chartData}>
                          <CartesianGrid {...gridProps} />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} width={40} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="total_indexes"      name="Total Indexes" stroke={COLORS.primary} dot={false} strokeWidth={2} />
                          <Bar dataKey="disabled_indexes"   name="Disabled"    fill={COLORS.red}    opacity={0.8} />
                          <Bar dataKey="unused_index_count" name="Unused"      fill={COLORS.amber}  opacity={0.8} />
                          <Bar dataKey="missing_index_count" name="Missing Suggestions" fill={COLORS.purple} opacity={0.8} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  <ChartCard title="Activity (seeks · scans · lookups)">
                    {!hasEnough ? <InsufficientData /> : (
                      <>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={chartData}>
                            <CartesianGrid {...gridProps} />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNum(v)} width={70} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatNum(v)} />
                            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                            <Line type="monotone" dataKey="total_seeks"   name="Seeks"   stroke={COLORS.green}  dot={false} strokeWidth={2} />
                            <Line type="monotone" dataKey="total_scans"   name="Scans"   stroke={COLORS.blue}   dot={false} strokeWidth={2} />
                            <Line type="monotone" dataKey="total_lookups" name="Lookups" stroke={COLORS.purple} dot={false} strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                        <p className="text-xs text-muted-foreground mt-1">Counters reset on SQL Server restart — a sudden drop is expected.</p>
                      </>
                    )}
                  </ChartCard>
                </div>
              </div>

              {/* Object Inventory */}
              <div>
                <SectionHeading>Object Inventory</SectionHeading>
                <ChartCard title="Schema Objects Over Time">
                  {!hasEnough ? <InsufficientData /> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="table_count"      name="Tables"      stroke={COLORS.primary} dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="view_count"        name="Views"       stroke={COLORS.blue}    dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="procedure_count"   name="Procedures"  stroke={COLORS.amber}   dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="function_count"    name="Functions"   stroke={COLORS.green}   dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>

              {/* Comparison table */}
              {snapshots.length >= 1 && (
                <div>
                  <SectionHeading>Comparison</SectionHeading>
                  <Card>
                    <CardContent className="p-4">
                      <ComparisonTable snapshots={snapshots} />
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
