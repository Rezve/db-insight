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
import { AlertTriangle } from "lucide-react";
import type { PrimaryKeyDetail } from "@/types/analysis";
import { buildDropConstraintDDL } from "@/lib/sql-queries";
import SqlPreviewDialog from "./SqlPreviewDialog";

interface EditKeyModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schema: string;
  tableName: string;
  pk: PrimaryKeyDetail;
  onSuccess: () => void;
}

export default function EditKeyModal({
  open,
  onOpenChange,
  schema,
  tableName,
  pk,
  onSuccess,
}: EditKeyModalProps) {
  const [previewSql, setPreviewSql] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  function handleDropPK() {
    setPreviewSql(buildDropConstraintDDL(schema, tableName, pk.constraintName));
    setPreviewOpen(true);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Primary Key</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Constraint name</p>
              <code className="font-mono text-sm">{pk.constraintName}</code>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Columns</p>
              <div className="flex flex-wrap gap-1">
                {pk.columns.map((c) => (
                  <Badge key={c} variant="secondary" className="font-mono text-[10px]">{c}</Badge>
                ))}
              </div>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-start gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-xs">
                  Dropping the primary key may affect referencing foreign keys and cause data integrity issues.
                </p>
              </div>

              <Button
                size="sm"
                variant="destructive"
                className="text-xs"
                onClick={handleDropPK}
              >
                Drop Primary Key
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
