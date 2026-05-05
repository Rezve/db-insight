"use client";

import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Rows3 } from "lucide-react";
import { useSessionCacheContext } from "@/contexts/session-cache-context";
import { useCachedFetch } from "@/hooks/use-cached-fetch";

interface RowCountCardProps {
  tableName: string;
  onRowCount?: (count: number) => void;
}

export default function RowCountCard({ tableName, onRowCount }: RowCountCardProps) {
  const { enabled } = useSessionCacheContext();
  const { data, loading, error } = useCachedFetch<{ rowCount: number; source: string }>(
    `row-count:${tableName}`,
    `/api/analysis/row-count?table=${encodeURIComponent(tableName)}`,
    enabled
  );

  const rowCount = data?.rowCount ?? null;
  const source = data?.source ?? "";

  useEffect(() => {
    if (data?.rowCount != null) onRowCount?.(data.rowCount);
  }, [data, onRowCount]);

  return (
    <Card className="w-full max-w-xs">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <Rows3 className="h-4 w-4" />
          Total Rows
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : (
          <div>
            <p className="text-3xl font-bold tabular-nums">
              {rowCount?.toLocaleString() ?? "—"}
            </p>
            {source === "metadata" && (
              <p className="text-xs text-muted-foreground mt-1">
                Approximate (from index metadata)
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
