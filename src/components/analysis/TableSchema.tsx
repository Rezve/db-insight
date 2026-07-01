"use client";

import { useEffect, useState } from "react";
import { useSessionCacheContext } from "@/contexts/session-cache-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Check, Copy, TableIcon, Code2 } from "lucide-react";
import type { TableColumnDetail, IndexInfo, ExtendedColumnDetail } from "@/types/analysis";
import { buildCreateTableDDL, buildIndexDDL } from "@/lib/sql-queries";
import { highlightDDL } from "@/lib/highlight-ddl";
import { formatDataType } from "@/lib/format-data-type";

interface TableSchemaProps {
  tableName: string;
}


export default function TableSchema({ tableName }: TableSchemaProps) {
  const { enabled, cache, refreshCount } = useSessionCacheContext();
  const [columns, setColumns] = useState<TableColumnDetail[]>([]);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [extended, setExtended] = useState<Map<string, ExtendedColumnDetail>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "sql">("table");
  const [copied, setCopied] = useState(false);

  const [schemaName, tableOnly] = tableName.includes(".")
    ? tableName.split(".", 2)
    : ["dbo", tableName];

  const colKey = `columns:${tableName}`;
  const idxKey = `indexes:${tableName}`;
  const extKey = `ext:${tableName}`;

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (enabled) {
      const cachedCols = cache.current.get(colKey) as { columns: TableColumnDetail[] } | undefined;
      const cachedIdx = cache.current.get(idxKey) as { indexes: IndexInfo[] } | undefined;
      const cachedExt = cache.current.get(extKey) as { columnDetails: ExtendedColumnDetail[] } | undefined;
      if (cachedCols !== undefined && cachedIdx !== undefined && cachedExt !== undefined) {
        setColumns(cachedCols.columns ?? []);
        setIndexes(cachedIdx.indexes ?? []);
        setExtended(new Map((cachedExt.columnDetails ?? []).map((e) => [e.columnName, e])));
        setLoading(false);
        return;
      }
    }

    Promise.all([
      fetch(`/api/analysis/columns?table=${encodeURIComponent(tableName)}`).then((r) => r.json()),
      fetch(`/api/analysis/indexes?table=${encodeURIComponent(tableName)}`).then((r) => r.json()),
      fetch(`/api/schema/column-details?table=${encodeURIComponent(tableName)}`).then((r) => r.json()),
    ])
      .then(([colData, idxData, extData]) => {
        if (colData.error) setError(colData.error);
        else {
          if (enabled) cache.current.set(colKey, colData);
          setColumns(colData.columns ?? []);
        }
        if (!idxData.error) {
          if (enabled) cache.current.set(idxKey, idxData);
          setIndexes(idxData.indexes ?? []);
        }
        if (!extData.error) {
          if (enabled) cache.current.set(extKey, extData);
          setExtended(new Map((extData.columnDetails ?? []).map((e: ExtendedColumnDetail) => [e.columnName, e])));
        }
      })
      .catch(() => setError("Failed to load column schema"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, enabled, refreshCount]);

  function buildFullDDL() {
    const parts = [buildCreateTableDDL(schemaName, tableOnly, columns, extended)];
    const indexDDL = buildIndexDDL(schemaName, tableOnly, indexes);
    if (indexDDL) parts.push(indexDDL);
    return parts.join("\n\n");
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildFullDDL()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (error) return <p className="text-destructive text-sm">{error}</p>;

  const ddl = view === "sql" ? buildFullDDL() : "";

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Columns ({columns.length})</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant={view === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setView("table")}
            >
              <TableIcon className="h-3 w-3" />
              Table
            </Button>
            <Button
              variant={view === "sql" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setView("sql")}
            >
              <Code2 className="h-3 w-3" />
              SQL
            </Button>
          </div>
        </div>
      </CardHeader>
      {view === "table" ? (
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
              {columns.map((col) => {
                const ext = extended.get(col.columnName);
                return (
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
                      {ext?.isComputed ? (
                        <span title={ext.computedDefinition ?? undefined}>
                          {ext.computedDefinition}
                          {ext.isPersisted ? " (PERSISTED)" : ""}
                        </span>
                      ) : (
                        col.columnDefault ?? <span className="text-muted-foreground/50">—</span>
                      )}
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
                        {ext?.isComputed && (
                          <Badge variant="secondary" className="text-[10px]">Computed</Badge>
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
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      ) : (
        <CardContent className="p-0">
          <div className="relative">
            <pre
              className="p-3 bg-zinc-900 rounded-b text-xs font-mono overflow-auto whitespace-pre"
              // Safe: ddl is generated by buildCreateTableDDL, not from user input.
              // highlightDDL escapes &, <, > before injecting HTML.
              dangerouslySetInnerHTML={{ __html: highlightDDL(ddl) }}
            />
            <Button
              size="sm"
              variant="secondary"
              className="absolute top-2 right-2 h-7 px-2 text-xs gap-1"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
