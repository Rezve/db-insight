"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { IndexInfo } from "@/types/analysis";
import {
  buildDropIndexDDL,
  buildAlterIndexDDL,
} from "@/lib/sql-queries";
import SqlPreviewDialog from "./SqlPreviewDialog";

interface EditIndexModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schema: string;
  tableName: string;
  index: IndexInfo;
  onSuccess: () => void;
}

export default function EditIndexModal({
  open,
  onOpenChange,
  schema,
  tableName,
  index,
  onSuccess,
}: EditIndexModalProps) {
  const [previewSql, setPreviewSql] = useState("");
  const [previewSqlOnline, setPreviewSqlOnline] = useState<string | undefined>(undefined);
  const [previewOpen, setPreviewOpen] = useState(false);

  function openPreview(sql: string, sqlOnline?: string) {
    setPreviewSql(sql);
    setPreviewSqlOnline(sqlOnline);
    setPreviewOpen(true);
  }

  const keyCols = index.columns
    .filter((c) => !c.isIncluded)
    .sort((a, b) => a.keyOrdinal - b.keyOrdinal)
    .map((c) => c.name);

  const includedCols = index.columns.filter((c) => c.isIncluded).map((c) => c.name);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Index:{" "}
              <span className="font-mono text-sm">{index.indexName}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[10px]">{index.type}</Badge>
              {index.isUnique && <Badge className="text-[10px]">UNIQUE</Badge>}
              {index.isPrimaryKey && <Badge className="text-[10px]">PRIMARY KEY</Badge>}
              {index.isDisabled && (
                <Badge variant="destructive" className="text-[10px]">DISABLED</Badge>
              )}
            </div>

            {/* Key columns */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Key columns</p>
              <div className="flex flex-wrap gap-1">
                {keyCols.map((c) => (
                  <Badge key={c} variant="secondary" className="font-mono text-[10px]">{c}</Badge>
                ))}
              </div>
            </div>

            {/* Included columns */}
            {includedCols.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Included columns</p>
                <div className="flex flex-wrap gap-1">
                  {includedCols.map((c) => (
                    <Badge key={c} variant="outline" className="font-mono text-[10px]">{c}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Filter */}
            {index.filterDefinition && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Filter</p>
                <code className="text-xs font-mono">{index.filterDefinition}</code>
              </div>
            )}

            {/* Actions */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Actions</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={index.isDisabled}
                  onClick={() =>
                    openPreview(buildAlterIndexDDL(schema, tableName, index.indexName, "DISABLE"))
                  }
                >
                  Disable
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={index.isDisabled}
                  title="Lightweight defrag — always online, less resource-intensive than a full rebuild"
                  onClick={() =>
                    openPreview(buildAlterIndexDDL(schema, tableName, index.indexName, "REORGANIZE"))
                  }
                >
                  Reorganize
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() =>
                    openPreview(
                      buildAlterIndexDDL(schema, tableName, index.indexName, "REBUILD"),
                      buildAlterIndexDDL(schema, tableName, index.indexName, "REBUILD", true)
                    )
                  }
                >
                  Rebuild
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="text-xs"
                  disabled={index.isPrimaryKey}
                  onClick={() =>
                    openPreview(buildDropIndexDDL(schema, tableName, index.indexName))
                  }
                >
                  Drop Index
                </Button>
              </div>
              {index.isPrimaryKey && (
                <p className="text-[10px] text-muted-foreground">
                  Primary key indexes cannot be dropped here — use the Keys section.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SqlPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        sql={previewSql}
        sqlOnline={previewSqlOnline}
        onSuccess={() => {
          setPreviewOpen(false);
          onOpenChange(false);
          onSuccess();
        }}
      />
    </>
  );
}
