"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HardDrive } from "lucide-react";

interface TableSizeCardProps {
  tableName: string;
}

export default function TableSizeCard({ tableName }: TableSizeCardProps) {
  const [sizeGB, setSizeGB] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analysis/table-size?table=${encodeURIComponent(tableName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setSizeGB(data.sizeGB);
      })
      .catch(() => setError("Failed to fetch table size"))
      .finally(() => setLoading(false));
  }, [tableName]);

  function formatSize(gb: number): string {
    if (gb >= 1) return `${gb.toFixed(3)} GB`;
    const mb = gb * 1024;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${(mb * 1024).toFixed(0)} KB`;
  }

  return (
    <Card className="w-full max-w-xs">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <HardDrive className="h-4 w-4" />
          Physical Size
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
              {sizeGB != null ? formatSize(sizeGB) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Reserved (data + indexes + overflow)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
