"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ForeignKeyDetail } from "@/types/analysis";
import { buildDropConstraintDDL } from "@/lib/sql-queries";
import SqlPreviewDialog from "./SqlPreviewDialog";

interface EditForeignKeyModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schema: string;
  tableName: string;
  fk: ForeignKeyDetail;
  onSuccess: () => void;
}

export default function EditForeignKeyModal({
  open,
  onOpenChange,
  schema,
  tableName,
  fk,
  onSuccess,
}: EditForeignKeyModalProps) {
  const [previewSql, setPreviewSql] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  function handleDropFK() {
    setPreviewSql(buildDropConstraintDDL(schema, tableName, fk.constraintName));
    setPreviewOpen(true);
  }

  function formatAction(action: string): string {
    return action.replace(/_/g, " ");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Foreign Key:{" "}
              <span className="font-mono text-sm">{fk.constraintName}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <span className="text-xs text-muted-foreground">Source column</span>
              <code className="font-mono text-xs">{fk.sourceColumn}</code>

              <span className="text-xs text-muted-foreground">References</span>
              <code className="font-mono text-xs">
                {fk.targetSchema}.{fk.targetTable} ({fk.targetColumn})
              </code>

              <span className="text-xs text-muted-foreground">On delete</span>
              <span className="text-xs">{formatAction(fk.onDelete)}</span>

              <span className="text-xs text-muted-foreground">On update</span>
              <span className="text-xs">{formatAction(fk.onUpdate)}</span>
            </div>

            <div className="border-t pt-3">
              <Button
                size="sm"
                variant="destructive"
                className="text-xs"
                onClick={handleDropFK}
              >
                Drop Foreign Key
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SqlPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        sql={previewSql}
        onSuccess={() => {
          setPreviewOpen(false);
          onOpenChange(false);
          onSuccess();
        }}
      />
    </>
  );
}
