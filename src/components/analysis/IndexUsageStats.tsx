"use client";

import { useEffect, useState } from "react";
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

export default function IndexUsageStats({ tableName }: IndexUsageStatsProps) {
  const [stats, setStats] = useState<IndexUsageStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analysis/index-usage?table=${encodeURIComponent(tableName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setStats(data.usageStats ?? []);
      })
      .catch(() => setError("Failed to load index usage"))
      .finally(() => setLoading(false));
  }, [tableName]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-destructive text-sm">{error}</p>;

  const maxSeeks = Math.max(...stats.map((s) => s.userSeeks), 1);
  const maxScans = Math.max(...stats.map((s) => s.userScans), 1);
  const maxUpdates = Math.max(...stats.map((s) => s.userUpdates), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          Index Usage Statistics
          <Badge variant="outline" className="text-[10px] font-normal">
            Since last SQL Server restart
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Index</TableHead>
              <TableHead>Seeks</TableHead>
              <TableHead>Scans</TableHead>
              <TableHead>Lookups</TableHead>
              <TableHead>Updates</TableHead>
              <TableHead>Last Activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map((stat) => {
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
