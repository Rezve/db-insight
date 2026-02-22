"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import type { IndexInfo } from "@/types/analysis";

interface IndexListProps {
  tableName: string;
}

export default function IndexList({ tableName }: IndexListProps) {
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analysis/indexes?table=${encodeURIComponent(tableName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setIndexes(data.indexes ?? []);
      })
      .catch(() => setError("Failed to load index info"))
      .finally(() => setLoading(false));
  }, [tableName]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-destructive text-sm">{error}</p>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Current Indexes ({indexes.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Key Columns</TableHead>
              <TableHead>Included Columns</TableHead>
              <TableHead>Properties</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {indexes.map((idx) => {
              const keyColumns = idx.columns
                .filter((c) => !c.isIncluded)
                .sort((a, b) => a.keyOrdinal - b.keyOrdinal)
                .map((c) => c.name);
              const includedColumns = idx.columns
                .filter((c) => c.isIncluded)
                .map((c) => c.name);

              return (
                <TableRow key={idx.indexId}>
                  <TableCell className="font-mono text-xs font-medium">
                    {idx.indexName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {idx.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[200px]">
                    {keyColumns.join(", ") || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px]">
                    {includedColumns.join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {idx.isPrimaryKey && (
                        <Badge className="text-[10px]">PK</Badge>
                      )}
                      {idx.isUnique && !idx.isPrimaryKey && (
                        <Badge variant="secondary" className="text-[10px]">Unique</Badge>
                      )}
                      {idx.isDisabled && (
                        <Badge variant="destructive" className="text-[10px]">Disabled</Badge>
                      )}
                      {idx.filterDefinition && (
                        <Badge variant="outline" className="text-[10px]" title={idx.filterDefinition}>
                          Filtered
                        </Badge>
                      )}
                    </div>
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
