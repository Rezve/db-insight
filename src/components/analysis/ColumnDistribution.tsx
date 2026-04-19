"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ColumnStat, SampleSize, DistributionResult } from "@/types/analysis";
import SelectivityPanel from "@/components/analysis/SelectivityPanel";

interface ColumnDistributionProps {
  tableName: string;
  sampleSize: SampleSize;
}

type ProgressState = {
  current: number;
  total: number;
  message: string;
} | null;

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ColumnCard({ col }: { col: ColumnStat }) {
  const nullPct =
    col.totalRows > 0 ? ((col.nullCount / col.totalRows) * 100).toFixed(1) : "0";

  const chartData = col.topValues.slice(0, 15).map((v) => ({
    name: v.value.length > 20 ? v.value.slice(0, 17) + "…" : v.value,
    fullName: v.value,
    count: v.count,
    pct: v.percentage,
  }));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
          <span className="font-mono">{col.name}</span>
          <Badge variant="outline" className="text-[10px] font-normal">
            {col.dataType}
          </Badge>
          {col.nullCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {nullPct}% NULL
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex gap-6 mb-3 flex-wrap">
          <StatBadge label="Distinct" value={col.distinctCount.toLocaleString()} />
          <StatBadge label="Non-null" value={col.nonNullCount.toLocaleString()} />
          {col.nullCount > 0 && (
            <StatBadge label="Null" value={col.nullCount.toLocaleString()} />
          )}
          {col.minValue != null && (
            <>
              <StatBadge label="Min" value={Number(col.minValue.toFixed(2)).toLocaleString()} />
              <StatBadge label="Max" value={Number(col.maxValue?.toFixed(2)).toLocaleString()} />
              <StatBadge label="Avg" value={Number(col.avgValue?.toFixed(2)).toLocaleString()} />
            </>
          )}
        </div>

        {chartData.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground mb-1">
              Top {chartData.length} values (by frequency)
            </p>
            <ResponsiveContainer width="100%" height={Math.max(80, chartData.length * 22)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => v.toLocaleString()} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10, fontFamily: "monospace" }}
                />
                <Tooltip
                  formatter={(value: number, _: string, props: { payload?: { fullName?: string; pct?: number } }) => [
                    `${value.toLocaleString()} (${props.payload?.pct ?? 0}%)`,
                    "Count",
                  ]}
                  labelFormatter={(label: string) => label}
                />
                <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                  {chartData.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={`hsl(${220 + idx * 8}, 70%, ${55 + idx * 2}%)`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ColumnDistribution({ tableName, sampleSize }: ColumnDistributionProps) {
  const [data, setData] = useState<DistributionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setData(null);
    setProgress(null);

    fetch(
      `/api/analysis/distribution?table=${encodeURIComponent(tableName)}&sampleSize=${sampleSize}`
    )
      .then(async (res) => {
        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => ({ error: "Request failed" }));
          setError(json.error ?? "Request failed");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);
              if (event.type === "start") {
                setProgress({ current: 0, total: event.totalColumns, message: event.message });
              } else if (event.type === "progress") {
                setProgress({ current: event.current, total: event.total, message: event.message });
              } else if (event.type === "complete") {
                setData(event.data as DistributionResult);
              } else if (event.type === "error") {
                setError(event.error);
              }
            } catch {
              // Malformed line — skip
            }
          }
        }
      })
      .catch(() => setError("Failed to load distribution data"))
      .finally(() => {
        setLoading(false);
        setProgress(null);
      });
  }, [tableName, sampleSize]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        {progress && (
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{progress.message}</span>
              {progress.total > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {progress.current} / {progress.total}
                </span>
              )}
            </div>
            {progress.total > 0 && (
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{
                    width: `${Math.round((progress.current / progress.total) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
        {!progress && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Analysed {data.actualRowsScanned.toLocaleString()} rows
        {sampleSize !== "full" && ` (${sampleSize} sample)`}
      </p>
      <SelectivityPanel columns={data.columns} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.columns.map((col) => (
          <ColumnCard key={col.name} col={col} />
        ))}
      </div>
    </div>
  );
}
