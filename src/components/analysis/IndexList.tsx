"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
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

  type SortKey = "name" | "size" | "type" | "properties";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
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

  const sorted = useMemo(() => {
    return [...indexes].sort((a, b) => {
      if (sortKey === null) {
        // Default: PK first, then unique, then others; ties broken by name
        const rank = (i: IndexInfo) => (i.isPrimaryKey ? 0 : i.isUnique ? 1 : 2);
        return rank(a) - rank(b) || a.indexName.localeCompare(b.indexName);
      }
      const propRank = (i: IndexInfo) => (i.isPrimaryKey ? 0 : i.isUnique ? 1 : i.isDisabled ? 2 : i.filterDefinition ? 3 : 4);
      let cmp = 0;
      if (sortKey === "name") cmp = a.indexName.localeCompare(b.indexName);
      if (sortKey === "size") cmp = (a.sizeGB ?? 0) - (b.sizeGB ?? 0);
      if (sortKey === "type") cmp = a.type.localeCompare(b.type);
      if (sortKey === "properties") cmp = propRank(a) - propRank(b);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [indexes, sortKey, sortDir]);

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
              <SortableHead label="Name" k="name" />
              <SortableHead label="Type" k="type" />
              <TableHead>Key Columns</TableHead>
              <TableHead>Included Columns</TableHead>
              <SortableHead label="Size (GB)" k="size" />
              <SortableHead label="Properties" k="properties" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((idx) => {
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
                  <TableCell className="font-mono text-xs max-w-[200px] whitespace-normal break-words">
                    {keyColumns.join(", ") || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] whitespace-normal break-words">
                    {includedColumns.join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-right">
                    {idx.sizeGB != null
                      ? idx.sizeGB < 0.001
                        ? "< 0.001"
                        : idx.sizeGB.toFixed(3)
                      : "—"}
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
