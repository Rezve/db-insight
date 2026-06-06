"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { TableColumnDetail, ExtendedColumnDetail } from "@/types/analysis";
import { formatDataType } from "@/lib/format-data-type";
import {
  buildAlterColumnDDL,
  buildDropAddDefaultDDL,
  buildColumnCommentDDL,
  buildRenameColumnDDL,
} from "@/lib/sql-queries";
import SqlPreviewDialog from "./SqlPreviewDialog";

const CHAR_TYPES = ["char", "nchar", "varchar", "nvarchar", "text", "ntext"];

interface EditColumnModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schema: string;
  tableName: string;
  column: TableColumnDetail;
  extended: ExtendedColumnDetail;
  onSuccess: () => void;
}

export default function EditColumnModal({
  open,
  onOpenChange,
  schema,
  tableName,
  column,
  extended,
  onSuccess,
}: EditColumnModalProps) {
  const [newName, setNewName] = useState(column.columnName);
  const [comment, setComment] = useState(extended.columnComment ?? "");
  const [isNullable, setIsNullable] = useState(column.isNullable);
  const [dataTypeFull, setDataTypeFull] = useState(formatDataType(column));
  const [collation, setCollation] = useState(extended.collationName ?? "");
  const [defaultExpr, setDefaultExpr] = useState(extended.defaultDefinition ?? "");

  const [previewSql, setPreviewSql] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setNewName(column.columnName);
    setComment(extended.columnComment ?? "");
    setIsNullable(column.isNullable);
    setDataTypeFull(formatDataType(column));
    setCollation(extended.collationName ?? "");
    setDefaultExpr(extended.defaultDefinition ?? "");
  }, [column, extended]);

  const isComputed = extended.isComputed;
  const isIdentity = column.isIdentity;
  const baseType = dataTypeFull.split("(")[0].toLowerCase();
  const collationEditable = CHAR_TYPES.includes(column.dataType.toLowerCase());

  function buildPreviewSql(): string {
    const stmts: string[] = [];

    const origDataType = formatDataType(column);
    const origNullable = column.isNullable;
    const origCollation = extended.collationName ?? "";

    if (!isComputed && !isIdentity) {
      if (
        dataTypeFull !== origDataType ||
        isNullable !== origNullable ||
        (collationEditable && collation !== origCollation)
      ) {
        stmts.push(
          buildAlterColumnDDL(
            schema,
            tableName,
            column.columnName,
            dataTypeFull,
            isNullable,
            collationEditable && collation ? collation : undefined
          )
        );
      }
    }

    if (defaultExpr !== (extended.defaultDefinition ?? "")) {
      const ddl = buildDropAddDefaultDDL(
        schema,
        tableName,
        column.columnName,
        extended.defaultConstraintName,
        defaultExpr
      );
      if (ddl) stmts.push(ddl);
    }

    if (comment !== (extended.columnComment ?? "")) {
      stmts.push(
        buildColumnCommentDDL(
          schema,
          tableName,
          column.columnName,
          comment,
          extended.columnComment !== null
        )
      );
    }

    if (newName.trim() && newName.trim() !== column.columnName) {
      stmts.push(buildRenameColumnDDL(schema, tableName, column.columnName, newName.trim()));
    }

    return stmts.join("\n\n");
  }

  function handlePreview() {
    const sql = buildPreviewSql();
    if (!sql.trim()) return;
    setPreviewSql(sql);
    setPreviewOpen(true);
  }

  const hasChanges = buildPreviewSql().trim().length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Edit Column:{" "}
              <span className="font-mono text-sm">{column.columnName}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Read-only status badges */}
            <div className="flex flex-wrap gap-2">
              {column.isPrimaryKey && <Badge className="text-[10px]">PK</Badge>}
              {isIdentity && (
                <Badge variant="outline" className="text-[10px]">
                  IDENTITY({extended.identitySeed ?? 1},{extended.identityIncrement ?? 1})
                </Badge>
              )}
              {isComputed && (
                <Badge variant="secondary" className="text-[10px]">COMPUTED</Badge>
              )}
              {extended.isSparse && (
                <Badge variant="outline" className="text-[10px]">SPARSE</Badge>
              )}
            </div>

            {isComputed && extended.computedDefinition && (
              <div>
                <Label className="text-xs text-muted-foreground">Computed expression</Label>
                <p className="font-mono text-xs mt-1 text-muted-foreground">
                  {extended.computedDefinition}
                  {extended.isPersisted ? " (PERSISTED)" : ""}
                </p>
              </div>
            )}

            {/* Rename */}
            <div className="space-y-1">
              <Label htmlFor="col-name" className="text-xs">Column name</Label>
              <Input
                id="col-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            {/* Comment */}
            <div className="space-y-1">
              <Label htmlFor="col-comment" className="text-xs">Comment (MS_Description)</Label>
              <Input
                id="col-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Column description..."
                className="text-sm"
              />
            </div>

            {/* Data type */}
            <div className="space-y-1">
              <Label htmlFor="col-type" className="text-xs">Data type</Label>
              <Input
                id="col-type"
                value={dataTypeFull}
                onChange={(e) => setDataTypeFull(e.target.value)}
                placeholder="e.g. nvarchar(100)"
                className="font-mono text-sm"
                disabled={isComputed || isIdentity}
              />
            </div>

            {/* Nullable */}
            <div className="space-y-1">
              <Label className="text-xs">Nullable</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={isNullable ? "secondary" : "outline"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setIsNullable(true)}
                  disabled={isComputed || isIdentity}
                >
                  NULL
                </Button>
                <Button
                  size="sm"
                  variant={!isNullable ? "secondary" : "outline"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setIsNullable(false)}
                  disabled={isComputed || isIdentity}
                >
                  NOT NULL
                </Button>
              </div>
            </div>

            {/* Collation */}
            <div className="space-y-1">
              <Label htmlFor="col-collation" className="text-xs">
                Collation
                {!collationEditable && (
                  <span className="text-muted-foreground ml-1">(only for char types)</span>
                )}
              </Label>
              <Input
                id="col-collation"
                value={collation}
                onChange={(e) => setCollation(e.target.value)}
                placeholder="e.g. SQL_Latin1_General_CP1_CI_AS"
                className="font-mono text-sm"
                disabled={!collationEditable || isComputed}
              />
            </div>

            {/* Default expression */}
            <div className="space-y-1">
              <Label htmlFor="col-default" className="text-xs">Default expression</Label>
              {extended.defaultConstraintName && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  Constraint: {extended.defaultConstraintName}
                </p>
              )}
              <Input
                id="col-default"
                value={defaultExpr}
                onChange={(e) => setDefaultExpr(e.target.value)}
                placeholder="e.g. (0) or (getdate())"
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Clearing this will drop the existing default constraint.
              </p>
            </div>

            {/* Sparse (read-only display) */}
            <div className="space-y-1">
              <Label className="text-xs">Sparse</Label>
              <p className="text-xs text-muted-foreground">
                {extended.isSparse ? "Yes — SPARSE column" : "No"}
                <span className="ml-2 text-muted-foreground/60">(cannot be changed via ALTER COLUMN)</span>
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handlePreview} disabled={!hasChanges}>
              Preview SQL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SqlPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        sql={previewSql}
        onSuccess={onSuccess}
      />
    </>
  );
}
