"use client";

import { use, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import SampleSizeSelector from "@/components/analysis/SampleSizeSelector";
import RowCountCard from "@/components/analysis/RowCountCard";
import ColumnDistribution from "@/components/analysis/ColumnDistribution";
import IndexList from "@/components/analysis/IndexList";
import IndexUsageStats from "@/components/analysis/IndexUsageStats";
import MissingIndexes from "@/components/analysis/MissingIndexes";
import type { SampleSize } from "@/types/analysis";

const FULL_SCAN_WARN_THRESHOLD = 500_000;

interface PageProps {
  params: Promise<{ tableName: string }>;
}

export default function TableAnalysisPage({ params }: PageProps) {
  const { tableName: encodedTableName } = use(params);
  const tableName = decodeURIComponent(encodedTableName);

  const [sampleSize, setSampleSize] = useState<SampleSize>("small");
  const [pendingSampleSize, setPendingSampleSize] = useState<SampleSize | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const handleRowCount = useCallback((count: number) => {
    setRowCount(count);
  }, []);

  function handleSampleSizeChange(next: SampleSize) {
    if (next === "full" && rowCount !== null && rowCount > FULL_SCAN_WARN_THRESHOLD) {
      setPendingSampleSize("full");
      setShowWarning(true);
    } else {
      setSampleSize(next);
    }
  }

  function confirmFullScan() {
    if (pendingSampleSize) setSampleSize(pendingSampleSize);
    setShowWarning(false);
    setPendingSampleSize(null);
  }

  const [schema, name] = tableName.includes(".")
    ? tableName.split(".", 2)
    : ["dbo", tableName];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-mono">{name}</h1>
        <p className="text-sm text-muted-foreground">
          Schema: <span className="font-mono">{schema}</span>
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
            <TabsTrigger value="indexes">Indexes</TabsTrigger>
            <TabsTrigger value="missing">Missing Indexes</TabsTrigger>
          </TabsList>
          <SampleSizeSelector value={sampleSize} onChange={handleSampleSizeChange} />
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <RowCountCard tableName={tableName} onRowCount={handleRowCount} />
          </div>
          <div className="text-sm text-muted-foreground max-w-prose space-y-2">
            <p>
              Select <strong>Distribution</strong> to see column data distribution charts,{" "}
              <strong>Indexes</strong> to view current indexes and their usage, or{" "}
              <strong>Missing Indexes</strong> to see SQL Server&apos;s suggestions for new indexes.
            </p>
            <p>
              Use the sample size selector to control how much data is scanned. Small (1,000 rows)
              is fastest; Full scans the entire table.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="distribution">
          <ColumnDistribution tableName={tableName} sampleSize={sampleSize} />
        </TabsContent>

        <TabsContent value="indexes" className="space-y-4">
          <IndexList tableName={tableName} />
          <IndexUsageStats tableName={tableName} />
        </TabsContent>

        <TabsContent value="missing">
          <MissingIndexes tableName={tableName} />
        </TabsContent>
      </Tabs>

      {/* Full scan warning dialog */}
      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Full Table Scan Warning</DialogTitle>
            <DialogDescription>
              This table has approximately{" "}
              <strong>{rowCount?.toLocaleString()}</strong> rows. A full scan may take a long time
              and consume significant server I/O. Are you sure you want to continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowWarning(false);
                setPendingSampleSize(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmFullScan}>
              Proceed with full scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
