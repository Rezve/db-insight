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
import type { TableColumnDetail } from "@/types/analysis";

interface TableSchemaProps {
  tableName: string;
}

function formatDataType(col: TableColumnDetail): string {
  const t = col.dataType.toLowerCase();
  if (["char", "varchar", "nchar", "nvarchar", "binary", "varbinary"].includes(t)) {
    if (col.maxLength === -1) return `${col.dataType}(max)`;
    if (col.maxLength != null) return `${col.dataType}(${col.maxLength})`;
  }
  if (["decimal", "numeric"].includes(t)) {
    if (col.numericPrecision != null && col.numericScale != null) {
      return `${col.dataType}(${col.numericPrecision}, ${col.numericScale})`;
    }
  }
  if (["float", "real"].includes(t) && col.numericPrecision != null) {
    return `${col.dataType}(${col.numericPrecision})`;
  }
  return col.dataType;
}

export default function TableSchema({ tableName }: TableSchemaProps) {
  const [columns, setColumns] = useState<TableColumnDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analysis/columns?table=${encodeURIComponent(tableName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setColumns(data.columns ?? []);
      })
      .catch(() => setError("Failed to load column schema"))
      .finally(() => setLoading(false));
  }, [tableName]);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (error) return <p className="text-destructive text-sm">{error}</p>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Columns ({columns.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 text-center">#</TableHead>
              <TableHead>Column</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Nullable</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>Properties</TableHead>
              <TableHead>References</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.map((col) => (
              <TableRow key={col.columnName}>
                <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
                  {col.ordinal}
                </TableCell>
                <TableCell className="font-mono text-xs font-medium">
                  {col.columnName}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {formatDataType(col)}
                </TableCell>
                <TableCell className="text-xs">
                  {col.isNullable ? (
                    <span className="text-muted-foreground">NULL</span>
                  ) : (
                    <span className="font-medium">NOT NULL</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground max-w-[160px] truncate">
                  {col.columnDefault ?? <span className="text-muted-foreground/50">—</span>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {col.isPrimaryKey && (
                      <Badge className="text-[10px]">PK</Badge>
                    )}
                    {col.fkTable && (
                      <Badge variant="secondary" className="text-[10px]">FK</Badge>
                    )}
                    {col.isIdentity && (
                      <Badge variant="outline" className="text-[10px]">Identity</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {col.fkTable ? (
                    <span>
                      {col.fkSchema}.{col.fkTable}
                      <span className="text-muted-foreground/60"> ({col.fkColumn})</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
