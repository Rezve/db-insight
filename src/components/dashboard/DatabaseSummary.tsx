"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database, Table2, Eye, Code2, FunctionSquare,
  HardDrive, BarChart2, ShieldCheck, Link2, Activity,
  AlertTriangle, Server, Clock, TrendingUp, Hash,
} from "lucide-react";
import type { DatabaseSummary } from "@/types/db";

function formatSize(sizeGB: number): string {
  if (sizeGB >= 1) return `${sizeGB.toFixed(2)} GB`;
  if (sizeGB * 1024 >= 1) return `${(sizeGB * 1024).toFixed(1)} MB`;
  return `${(sizeGB * 1024 * 1024).toFixed(0)} KB`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatUptime(minutes: number): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: "default" | "warning" | "danger";
}

function StatCard({ title, value, subtitle, icon, variant = "default" }: StatCardProps) {
  const valueColor =
    variant === "danger" ? "text-destructive" :
    variant === "warning" ? "text-amber-500" :
    "";
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{children}</h2>;
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <Skeleton className="h-3 w-24" />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

export default function DatabaseSummary() {
  const [data, setData] = useState<DatabaseSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/summary")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json as DatabaseSummary);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Failed to load summary: {error}
      </div>
    );
  }

  const iconCls = "h-3.5 w-3.5";

  if (!data) {
    return (
      <div className="space-y-6">
        {[4, 4, 4, 4].map((count, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-32 mb-3" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: count }).map((_, j) => <StatCardSkeleton key={j} />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const pkPct = data.tableCount > 0
    ? Math.round((data.tablesWithPK / data.tableCount) * 100)
    : 0;

  const largestTableHref = data.largestTableName
    ? `/dashboard/tables/${encodeURIComponent(data.largestTableName)}`
    : null;

  return (
    <div className="space-y-6">
      {/* Server Info */}
      <div>
        <SectionHeading>Server</SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            title="Server Name"
            value={<span className="text-base font-mono">{data.serverName}</span>}
            icon={<Server className={iconCls} />}
          />
          <StatCard
            title="Database"
            value={<span className="text-base font-mono">{data.databaseName}</span>}
            icon={<Database className={iconCls} />}
          />
          <StatCard
            title="Edition"
            value={<span className="text-base">{data.edition}</span>}
            icon={<Server className={iconCls} />}
          />
          <StatCard
            title="SQL Server Version"
            value={<span className="text-base font-mono">{data.sqlVersion}</span>}
            icon={<Server className={iconCls} />}
          />
        </div>
      </div>

      {/* Storage */}
      <div>
        <SectionHeading>Storage</SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            title="Total Size"
            value={formatSize(data.totalSizeGB)}
            icon={<HardDrive className={iconCls} />}
          />
          <StatCard
            title="Data Size"
            value={formatSize(data.dataSizeGB)}
            subtitle="heap + clustered"
            icon={<Database className={iconCls} />}
          />
          <StatCard
            title="Index Overhead"
            value={formatSize(data.indexSizeGB)}
            subtitle="nonclustered indexes"
            icon={<BarChart2 className={iconCls} />}
          />
          <StatCard
            title="Largest Table"
            value={
              largestTableHref ? (
                <Link href={largestTableHref} className="hover:underline text-primary truncate block max-w-full">
                  {data.largestTableName?.split(".").pop() ?? data.largestTableName}
                </Link>
              ) : (
                <span className="text-muted-foreground text-base">—</span>
              )
            }
            subtitle={data.largestTableName?.includes(".") ? data.largestTableName.split(".")[0] : undefined}
            icon={<TrendingUp className={iconCls} />}
          />
        </div>
      </div>

      {/* Activity */}
      <div>
        <SectionHeading>Activity</SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            title="Index Seeks"
            value={formatNumber(data.totalSeeks)}
            icon={<Activity className={iconCls} />}
          />
          <StatCard
            title="Index Scans"
            value={formatNumber(data.totalScans)}
            icon={<Activity className={iconCls} />}
          />
          <StatCard
            title="Index Lookups"
            value={formatNumber(data.totalLookups)}
            icon={<Activity className={iconCls} />}
          />
          <StatCard
            title="Server Uptime"
            value={formatUptime(data.uptimeMinutes)}
            subtitle={data.sqlVersion}
            icon={<Clock className={iconCls} />}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Activity counters reset on SQL Server restart.
        </p>
      </div>

      {/* Index Health */}
      <div>
        <SectionHeading>Index Health</SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            title="Total Indexes"
            value={formatNumber(data.totalIndexes)}
            icon={<BarChart2 className={iconCls} />}
          />
          <StatCard
            title="Disabled Indexes"
            value={formatNumber(data.disabledIndexes)}
            icon={<AlertTriangle className={iconCls} />}
            variant={data.disabledIndexes > 0 ? "danger" : "default"}
          />
          <StatCard
            title="Unused Indexes"
            value={formatNumber(data.unusedIndexCount)}
            subtitle="no seeks, scans, or lookups"
            icon={<AlertTriangle className={iconCls} />}
            variant={data.unusedIndexCount > 0 ? "warning" : "default"}
          />
          <StatCard
            title="Missing Index Suggestions"
            value={formatNumber(data.missingIndexCount)}
            subtitle={`across ${data.tablesWithMissingIndexes} tables`}
            icon={<AlertTriangle className={iconCls} />}
            variant={data.missingIndexCount > 0 ? "warning" : "default"}
          />
        </div>
      </div>

      {/* Schema Health */}
      <div>
        <SectionHeading>Schema Health</SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            title="Total Columns"
            value={formatNumber(data.totalColumnCount)}
            icon={<Hash className={iconCls} />}
          />
          <StatCard
            title="PK Coverage"
            value={`${pkPct}%`}
            subtitle={`${data.tablesWithPK} of ${data.tableCount} tables`}
            icon={<ShieldCheck className={iconCls} />}
            variant={pkPct < 100 ? "warning" : "default"}
          />
          <StatCard
            title="Foreign Keys"
            value={formatNumber(data.foreignKeyCount)}
            icon={<Link2 className={iconCls} />}
          />
          <StatCard
            title="Approx. Total Rows"
            value={formatNumber(data.totalRows)}
            subtitle="from sys.partitions metadata"
            icon={<Database className={iconCls} />}
          />
        </div>
      </div>

      {/* Object Inventory */}
      <div>
        <SectionHeading>Object Inventory</SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard title="Tables" value={formatNumber(data.tableCount)} icon={<Table2 className={iconCls} />} />
          <StatCard title="Views" value={formatNumber(data.viewCount)} icon={<Eye className={iconCls} />} />
          <StatCard title="Stored Procedures" value={formatNumber(data.procedureCount)} icon={<Code2 className={iconCls} />} />
          <StatCard title="Functions" value={formatNumber(data.functionCount)} icon={<FunctionSquare className={iconCls} />} />
        </div>
      </div>
    </div>
  );
}
