"use client";

import { useEffect, useState } from "react";
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
import type { TableColumnDetail, IndexInfo } from "@/types/analysis";
import { buildCreateTableDDL, buildIndexDDL } from "@/lib/sql-queries";

interface TableSchemaProps {
  tableName: string;
}

// Tokenise a CREATE TABLE DDL string and wrap tokens in coloured <span>s.
// Uses inline styles so Tailwind purging cannot remove the classes.
function highlightDDL(ddl: string): string {
  const rules: Array<[RegExp, string]> = [
    // [quoted identifiers]
    [/\[[^\]]*\]/y, "color:#fbbf24"],
    // SQL keywords
    [/\b(CREATE|TABLE|CONSTRAINT|PRIMARY|KEY|NOT|NULL|IDENTITY|DEFAULT|UNIQUE|NONCLUSTERED|CLUSTERED|INDEX|ON|INCLUDE)\b/iy, "color:#60a5fa;font-weight:600"],
    // Data types
    [/\b(INT|BIGINT|SMALLINT|TINYINT|VARCHAR|NVARCHAR|CHAR|NCHAR|TEXT|NTEXT|DECIMAL|NUMERIC|FLOAT|REAL|DATETIME2|DATETIME|DATE|TIME|BIT|MONEY|SMALLMONEY|UNIQUEIDENTIFIER|VARBINARY|BINARY|IMAGE|XML|MAX)\b/iy, "color:#34d399"],
    // Numbers
    [/\b\d+\b/y, "color:#fb923c"],
    // Punctuation
    [/[(),;]/y, "color:#94a3b8"],
    // Whitespace (no style — preserve as-is)
    [/\s+/y, ""],
    // Fallback: any remaining character
    [/[\s\S]/y, "color:#e2e8f0"],
  ];

  let html = "";
  let pos = 0;
  while (pos < ddl.length) {
    for (const [re, style] of rules) {
      re.lastIndex = pos;
      const m = re.exec(ddl);
      if (m) {
        const safe = m[0].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        html += style ? `<span style="${style}">${safe}</span>` : safe;
        pos += m[0].length;
        break;
      }
    }
  }
  return html;
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
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "sql">("table");
  const [copied, setCopied] = useState(false);

  const [schemaName, tableOnly] = tableName.includes(".")
    ? tableName.split(".", 2)
    : ["dbo", tableName];

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/analysis/columns?table=${encodeURIComponent(tableName)}`).then((r) => r.json()),
      fetch(`/api/analysis/indexes?table=${encodeURIComponent(tableName)}`).then((r) => r.json()),
    ])
      .then(([colData, idxData]) => {
        if (colData.error) setError(colData.error);
        else setColumns(colData.columns ?? []);
        if (!idxData.error) setIndexes(idxData.indexes ?? []);
      })
      .catch(() => setError("Failed to load column schema"))
      .finally(() => setLoading(false));
  }, [tableName]);

  function buildFullDDL() {
    const parts = [buildCreateTableDDL(schemaName, tableOnly, columns)];
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
