"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Info, ArrowUpDown } from "lucide-react";
import type { ColumnStat } from "@/types/analysis";

interface SelectivityPanelProps {
  columns: ColumnStat[];
}

type SortKey = "name" | "cardinality" | "nullRate" | "skew" | "suitability";
type SortDir = "asc" | "desc";

type Suitability = "Excellent" | "Good" | "Low" | "Poor" | "Skewed";

interface ColumnMetrics {
  name: string;
  dataType: string;
  cardinality: number;        // 0–1  (distinctCount / nonNullCount)
  cardinalityPct: number;     // 0–100
  nullRate: number;           // 0–100
  dominantPct: number;        // top value's share, 0–100
  suitability: Suitability;
  suitabilityOrder: number;   // for sorting
  skewed: boolean;
}

const SUITABILITY_ORDER: Record<Suitability, number> = {
  Excellent: 0,
  Good: 1,
  Low: 2,
  Skewed: 3,
  Poor: 4,
};

function computeSuitability(cardinality: number, dominantPct: number): Suitability {
  const isSkewed = dominantPct >= 50;
  if (cardinality >= 0.9) return "Excellent";
  if (cardinality >= 0.15) return "Good";
  if (cardinality >= 0.05) return "Low";
  if (isSkewed) return "Skewed";
  return "Poor";
}

const SUITABILITY_STYLES: Record<Suitability, string> = {
  Excellent: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  Good:      "bg-blue-500/15 text-blue-700 border-blue-200",
  Low:       "bg-yellow-500/15 text-yellow-700 border-yellow-200",
  Poor:      "bg-red-500/15 text-red-700 border-red-200",
  Skewed:    "bg-orange-500/15 text-orange-700 border-orange-200",
};

const SUITABILITY_TOOLTIP: Record<Suitability, string> = {
  Excellent: "Nearly unique — highly selective, excellent index candidate",
  Good:      "Good variety of values — worthwhile index candidate",
  Low:       "Limited distinct values — index may have modest benefit",
  Poor:      "Very few distinct values — index unlikely to help",
  Skewed:    "Low cardinality but heavily skewed — consider a filtered index on the minority value",
};

function CardinalityBar({ value }: { value: number }) {
  const pct = Math.min(100, value * 100);
  const color =
    pct >= 90 ? "bg-emerald-500" :
    pct >= 15 ? "bg-blue-400" :
    pct >= 5  ? "bg-yellow-400" :
                "bg-red-400";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

export default function SelectivityPanel({ columns }: SelectivityPanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>("suitability");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const metrics: ColumnMetrics[] = useMemo(() =>
    columns.map((col) => {
      const nonNull = Math.max(col.nonNullCount, 1);
      const totalRows = Math.max(col.totalRows, 1);
      const cardinality = col.distinctCount / nonNull;
      const dominantPct = col.topValues[0]?.percentage ?? 0;
      const suitability = computeSuitability(cardinality, dominantPct);
      return {
        name: col.name,
        dataType: col.dataType,
        cardinality,
        cardinalityPct: cardinality * 100,
        nullRate: (col.nullCount / totalRows) * 100,
        dominantPct,
        suitability,
        suitabilityOrder: SUITABILITY_ORDER[suitability],
        skewed: dominantPct >= 50,
      };
    }),
    [columns]
  );

  const sorted = useMemo(() => {
    return [...metrics].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":        cmp = a.name.localeCompare(b.name); break;
        case "cardinality": cmp = a.cardinality - b.cardinality; break;
        case "nullRate":    cmp = a.nullRate - b.nullRate; break;
        case "skew":        cmp = a.dominantPct - b.dominantPct; break;
        case "suitability": cmp = a.suitabilityOrder - b.suitabilityOrder; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [metrics, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "suitability" || key === "name" ? "asc" : "desc");
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          Distribution &amp; Selectivity
          <span className="text-xs text-muted-foreground font-normal">
            — {columns.length} columns
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Column" k="name" />
              <TableHead>Type</TableHead>
              <SortableHead label="Cardinality" k="cardinality" />
              <SortableHead label="Null %" k="nullRate" />
              <SortableHead label="Dominant value" k="skew" />
              <SortableHead label="Index suitability" k="suitability" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((m) => (
              <TableRow key={m.name}>
                <TableCell className="font-mono text-xs font-medium">{m.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] font-normal">{m.dataType}</Badge>
                </TableCell>
                <TableCell>
                  <CardinalityBar value={m.cardinality} />
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {m.nullRate > 0 ? (
                    <span className={m.nullRate > 30 ? "text-destructive" : "text-muted-foreground"}>
                      {m.nullRate.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {m.dominantPct > 0 ? (
                    <span className={m.skewed ? "text-orange-600 font-medium" : "text-muted-foreground"}>
                      {m.dominantPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    title={SUITABILITY_TOOLTIP[m.suitability]}
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium cursor-default ${SUITABILITY_STYLES[m.suitability]}`}
                  >
                    {m.suitability}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Legend */}
        <div className="flex items-start gap-2 px-4 py-3 border-t bg-muted/30 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <p>
            <strong>Cardinality</strong> = distinct non-null values ÷ total non-null rows.
            Indexes work best on high-cardinality columns (queries returning &lt;5–10% of rows).{" "}
            <strong>Skewed</strong> columns have low overall cardinality but one dominant value —
            a <em>filtered index</em> on the minority value can be very effective.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
