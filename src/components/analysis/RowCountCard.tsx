"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Rows3 } from "lucide-react";

interface RowCountCardProps {
  tableName: string;
  onRowCount?: (count: number) => void;
}

export default function RowCountCard({ tableName, onRowCount }: RowCountCardProps) {
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analysis/row-count?table=${encodeURIComponent(tableName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setRowCount(data.rowCount);
          setSource(data.source);
          onRowCount?.(data.rowCount);
        }
      })
      .catch(() => setError("Failed to fetch row count"))
      .finally(() => setLoading(false));
  }, [tableName, onRowCount]);

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
