"use client";

import { useEffect, useState, useMemo } from "react";
import { useSessionCacheContext } from "@/contexts/session-cache-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  TableColumnDetail,
  IndexInfo,
  ExtendedColumnDetail,
  ForeignKeyDetail,
  PrimaryKeyDetail,
} from "@/types/analysis";
import { formatDataType } from "@/lib/format-data-type";
import EditColumnModal from "./modify/EditColumnModal";
import EditIndexModal from "./modify/EditIndexModal";
import EditKeyModal from "./modify/EditKeyModal";
import EditForeignKeyModal from "./modify/EditForeignKeyModal";

type Section = "columns" | "keys" | "indexes" | "fk";

interface TableModifierProps {
  tableName: string;
}

export default function TableModifier({ tableName }: TableModifierProps) {
  const { enabled, refreshCount, invalidate } = useSessionCacheContext();

  const [schema, tableOnly] = tableName.includes(".")
    ? tableName.split(".", 2)
    : ["dbo", tableName];

  const [columns, setColumns] = useState<TableColumnDetail[]>([]);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [extDetails, setExtDetails] = useState<ExtendedColumnDetail[]>([]);
  const [fkDetails, setFkDetails] = useState<ForeignKeyDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openSection, setOpenSection] = useState<Section | null>(null);

  // Column modal state
  const [selectedColumn, setSelectedColumn] = useState<TableColumnDetail | null>(null);
  const [columnModalOpen, setColumnModalOpen] = useState(false);

  // Index modal state
  const [selectedIndex, setSelectedIndex] = useState<IndexInfo | null>(null);
  const [indexModalOpen, setIndexModalOpen] = useState(false);

  // PK modal state
  const [keyModalOpen, setKeyModalOpen] = useState(false);

  // FK modal state
  const [selectedFk, setSelectedFk] = useState<ForeignKeyDetail | null>(null);
  const [fkModalOpen, setFkModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const enc = encodeURIComponent(tableName);
    Promise.all([
      fetch(`/api/analysis/columns?table=${enc}`).then((r) => r.json()),
      fetch(`/api/analysis/indexes?table=${enc}`).then((r) => r.json()),
      fetch(`/api/schema/column-details?table=${enc}`).then((r) => r.json()),
      fetch(`/api/schema/foreign-keys?table=${enc}`).then((r) => r.json()),
    ])
      .then(([colData, idxData, extData, fkData]) => {
        if (colData.error) { setError(colData.error); return; }
        setColumns(colData.columns ?? []);
        setIndexes(idxData.indexes ?? []);
        setExtDetails(extData.columnDetails ?? []);
        setFkDetails(fkData.foreignKeys ?? []);
      })
      .catch(() => setError("Failed to load table structure"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, enabled, refreshCount]);

  const pk = useMemo((): PrimaryKeyDetail | null => {
    const pkIdx = indexes.find((i) => i.isPrimaryKey);
    if (!pkIdx) return null;
    return {
      constraintName: pkIdx.indexName,
      columns: pkIdx.columns
        .filter((c) => !c.isIncluded)
        .sort((a, b) => a.keyOrdinal - b.keyOrdinal)
        .map((c) => c.name),
    };
  }, [indexes]);

  const nonPkIndexes = useMemo(() => indexes.filter((i) => !i.isPrimaryKey), [indexes]);

  // Deduplicate FK rows to one entry per constraint (rows are one per column)
  const uniqueFks = useMemo(() => {
    const seen = new Set<string>();
    return fkDetails.filter((fk) => {
      if (seen.has(fk.constraintName)) return false;
      seen.add(fk.constraintName);
      return true;
    });
  }, [fkDetails]);

  function getExtended(colName: string): ExtendedColumnDetail | undefined {
    return extDetails.find((e) => e.columnName === colName);
  }

  function toggleSection(section: Section) {
    setOpenSection((prev) => (prev === section ? null : section));
  }

  function handleSuccess() {
    invalidate();
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>;
  }

  return (
    <div className="space-y-3">
      {/* Columns section */}
      <Card className="gap-0 py-0">
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none"
          onClick={() => toggleSection("columns")}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              Columns <span className="text-muted-foreground font-normal">({columns.length})</span>
            </CardTitle>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                openSection === "columns" && "rotate-180"
              )}
            />
          </div>
        </CardHeader>
        {openSection === "columns" && (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 text-center">#</TableHead>
                  <TableHead>Column</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Nullable</TableHead>
                  <TableHead>Properties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {columns.map((col) => {
                  const ext = getExtended(col.columnName);
                  return (
                    <TableRow
                      key={col.columnName}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setSelectedColumn(col);
                        setColumnModalOpen(true);
                      }}
                    >
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
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {col.isPrimaryKey && <Badge className="text-[10px]">PK</Badge>}
                          {col.fkTable && (
                            <Badge variant="secondary" className="text-[10px]">FK</Badge>
                          )}
                          {col.isIdentity && (
                            <Badge variant="outline" className="text-[10px]">Identity</Badge>
                          )}
                          {ext?.isComputed && (
                            <Badge variant="secondary" className="text-[10px]">Computed</Badge>
                          )}
                          {ext?.isSparse && (
                            <Badge variant="outline" className="text-[10px]">Sparse</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* Primary Key section */}
      <Card className="gap-0 py-0">
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none"
          onClick={() => toggleSection("keys")}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Primary Key</CardTitle>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                openSection === "keys" && "rotate-180"
              )}
            />
          </div>
        </CardHeader>
        {openSection === "keys" && (
          <CardContent className="p-0">
            {pk ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Constraint</TableHead>
                    <TableHead>Columns</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setKeyModalOpen(true)}
                  >
                    <TableCell className="font-mono text-xs">{pk.constraintName}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {pk.columns.map((c) => (
                          <Badge key={c} variant="secondary" className="font-mono text-[10px]">{c}</Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            ) : (
              <p className="px-4 py-3 text-sm text-muted-foreground">No primary key defined.</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Indexes section */}
      <Card className="gap-0 py-0">
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none"
          onClick={() => toggleSection("indexes")}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              Indexes <span className="text-muted-foreground font-normal">({nonPkIndexes.length})</span>
            </CardTitle>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                openSection === "indexes" && "rotate-180"
              )}
            />
          </div>
        </CardHeader>
        {openSection === "indexes" && (
          <CardContent className="p-0">
            {nonPkIndexes.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No non-primary-key indexes.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Key columns</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nonPkIndexes.map((idx) => (
                    <TableRow
                      key={idx.indexId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setSelectedIndex(idx);
                        setIndexModalOpen(true);
                      }}
                    >
                      <TableCell className="font-mono text-xs">{idx.indexName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{idx.type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {idx.columns
                          .filter((c) => !c.isIncluded)
                          .sort((a, b) => a.keyOrdinal - b.keyOrdinal)
                          .map((c) => c.name)
                          .join(", ")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {idx.isUnique && <Badge className="text-[10px]">Unique</Badge>}
                          {idx.isDisabled && (
                            <Badge variant="destructive" className="text-[10px]">Disabled</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>

      {/* Foreign Keys section */}
      <Card className="gap-0 py-0">
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none"
          onClick={() => toggleSection("fk")}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              Foreign Keys <span className="text-muted-foreground font-normal">({uniqueFks.length})</span>
            </CardTitle>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                openSection === "fk" && "rotate-180"
              )}
            />
          </div>
        </CardHeader>
        {openSection === "fk" && (
          <CardContent className="p-0">
            {uniqueFks.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No foreign keys defined.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Constraint</TableHead>
                    <TableHead>Source column</TableHead>
                    <TableHead>References</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uniqueFks.map((fk) => (
                    <TableRow
                      key={fk.constraintName}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setSelectedFk(fk);
                        setFkModalOpen(true);
                      }}
                    >
                      <TableCell className="font-mono text-xs">{fk.constraintName}</TableCell>
                      <TableCell className="font-mono text-xs">{fk.sourceColumn}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {fk.targetSchema}.{fk.targetTable} ({fk.targetColumn})
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>

      {/* Modals */}
      {selectedColumn && getExtended(selectedColumn.columnName) && (
        <EditColumnModal
          open={columnModalOpen}
          onOpenChange={(v) => {
            setColumnModalOpen(v);
            if (!v) setSelectedColumn(null);
          }}
          schema={schema}
          tableName={tableOnly}
          column={selectedColumn}
          extended={getExtended(selectedColumn.columnName)!}
          onSuccess={handleSuccess}
        />
      )}

      {selectedIndex && (
        <EditIndexModal
          open={indexModalOpen}
          onOpenChange={(v) => {
            setIndexModalOpen(v);
            if (!v) setSelectedIndex(null);
          }}
          schema={schema}
          tableName={tableOnly}
          index={selectedIndex}
          onSuccess={handleSuccess}
        />
      )}

      {pk && (
        <EditKeyModal
          open={keyModalOpen}
          onOpenChange={setKeyModalOpen}
          schema={schema}
          tableName={tableOnly}
          pk={pk}
          onSuccess={handleSuccess}
        />
      )}

      {selectedFk && (
        <EditForeignKeyModal
          open={fkModalOpen}
          onOpenChange={(v) => {
            setFkModalOpen(v);
            if (!v) setSelectedFk(null);
          }}
          schema={schema}
          tableName={tableOnly}
          fk={selectedFk}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
