"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { IndexUsageStat } from "@/types/analysis";

interface IndexUsageStatsProps {
  tableName: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function UsageBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 min-w-[60px]">
        <div
          className="bg-primary rounded-full h-1.5 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums text-xs w-16 text-right">{value.toLocaleString()}</span>
    </div>
  );
}

function formatUptime(isoStart: string): string {
  const diffMs = Date.now() - new Date(isoStart).getTime();
  const totalMinutes = Math.floor(diffMs / 60000);
  const months = Math.floor(totalMinutes / 43200);
  const days = Math.floor((totalMinutes % 43200) / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const parts: string[] = [];
  if (months > 0) parts.push(`${months}mo`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || parts.length === 0) parts.push(`${hours}h`);
  return parts.join(" ");
}

export default function IndexUsageStats({ tableName }: IndexUsageStatsProps) {
  type SortKey = "seeks" | "scans" | "lookups" | "lastActivity";
  type SortDir = "asc" | "desc";

  const [stats, setStats] = useState<IndexUsageStat[]>([]);
  const [serverStartTime, setServerStartTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analysis/index-usage?table=${encodeURIComponent(tableName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setStats(data.usageStats ?? []);
          setServerStartTime(data.serverStartTime ?? null);
        }
      })
      .catch(() => setError("Failed to load index usage"))
      .finally(() => setLoading(false));
  }, [tableName]);

  const sorted = useMemo(() => {
    if (sortKey === null) return stats;
    return [...stats].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "seeks") cmp = a.userSeeks - b.userSeeks;
      if (sortKey === "scans") cmp = a.userScans - b.userScans;
      if (sortKey === "lookups") cmp = a.userLookups - b.userLookups;
      if (sortKey === "lastActivity") {
        const aTime = Math.max(
          a.lastUserSeek ? new Date(a.lastUserSeek).getTime() : 0,
          a.lastUserScan ? new Date(a.lastUserScan).getTime() : 0,
          a.lastUserLookup ? new Date(a.lastUserLookup).getTime() : 0,
        );
        const bTime = Math.max(
          b.lastUserSeek ? new Date(b.lastUserSeek).getTime() : 0,
          b.lastUserScan ? new Date(b.lastUserScan).getTime() : 0,
          b.lastUserLookup ? new Date(b.lastUserLookup).getTime() : 0,
        );
        cmp = aTime - bTime;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [stats, sortKey, sortDir]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-destructive text-sm">{error}</p>;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortableHead({ label, k }: { label: string; k: SortKey }) {
    return (
      <TableHead
        className="cursor-pointer select-none whitespace-nowrap"
        onClick={() => toggleSort(k)}
      >
        <span className="flex items-center gap-1">
          {label}
          <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-foreground" : "text-muted-foreground/40"}`} />
        </span>
      </TableHead>
    );
  }

  const maxSeeks = Math.max(...stats.map((s) => s.userSeeks), 1);
  const maxScans = Math.max(...stats.map((s) => s.userScans), 1);
  const maxUpdates = Math.max(...stats.map((s) => s.userUpdates), 1);

  const unusedIndexes = stats.filter(
    (s) => s.userSeeks + s.userScans + s.userLookups === 0
  );
  const unusedSizeGB = unusedIndexes.reduce((sum, s) => sum + (s.sizeGB ?? 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          Index Usage Statistics
          <Badge variant="outline" className="text-[10px] font-normal">
            Since last SQL Server restart
            {serverStartTime && (
              <span className="ml-1 text-muted-foreground">· {formatUptime(serverStartTime)} ago</span>
            )}
          </Badge>
        </CardTitle>
      </CardHeader>
      {unusedIndexes.length > 0 && (
        <div className="mx-6 mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">{unusedIndexes.length} unused {unusedIndexes.length === 1 ? "index" : "indexes"}</span>
            {unusedSizeGB > 0 && (
              <> — dropping {unusedIndexes.length === 1 ? "it" : "them"} could reclaim{" "}
              <span className="font-semibold">
                {unusedSizeGB < 0.001 ? "< 0.001" : unusedSizeGB.toFixed(3)} GB
              </span></>
            )}
          </span>
        </div>
      )}
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Index</TableHead>
              <SortableHead label="Seeks" k="seeks" />
              <SortableHead label="Scans" k="scans" />
              <SortableHead label="Lookups" k="lookups" />
              <TableHead>Updates</TableHead>
              <TableHead>Size (GB)</TableHead>
              <SortableHead label="Last Activity" k="lastActivity" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((stat) => {
              const lastActivity = [stat.lastUserSeek, stat.lastUserScan, stat.lastUserLookup]
                .filter(Boolean)
                .sort()
                .pop();
              const totalReads = stat.userSeeks + stat.userScans + stat.userLookups;
              const isUnused = totalReads === 0;

              return (
                <TableRow key={stat.indexId}>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-1">
                      {stat.indexName}
                      {isUnused && (
                        <Badge variant="destructive" className="text-[10px]">
                          Unused
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <UsageBar value={stat.userSeeks} max={maxSeeks} />
                  </TableCell>
                  <TableCell>
                    <UsageBar value={stat.userScans} max={maxScans} />
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {stat.userLookups.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <UsageBar value={stat.userUpdates} max={maxUpdates} />
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-right">
                    {stat.sizeGB == null
                      ? "—"
                      : stat.sizeGB < 0.001
                      ? "< 0.001"
                      : stat.sizeGB.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(lastActivity ?? null)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
