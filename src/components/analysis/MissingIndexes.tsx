"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, CheckCircle2 } from "lucide-react";
import type { MissingIndex } from "@/types/analysis";

interface MissingIndexesProps {
  tableName: string;
}

function ImpactBar({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const color =
    pct >= 70 ? "bg-red-500" : pct >= 40 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-2">
        <div className={`${color} rounded-full h-2 transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-xs w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

export default function MissingIndexes({ tableName }: MissingIndexesProps) {
  const [suggestions, setSuggestions] = useState<MissingIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDDL, setExpandedDDL] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analysis/missing-indexes?table=${encodeURIComponent(tableName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setSuggestions(data.suggestions ?? []);
      })
      .catch(() => setError("Failed to load missing index data"))
      .finally(() => setLoading(false));
  }, [tableName]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-destructive text-sm">{error}</p>;

  if (suggestions.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-6">
        <CheckCircle2 className="h-5 w-5 text-green-500" />
        <p className="text-sm">
          No missing index suggestions found. SQL Server has not identified any gaps.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""} from{" "}
        <code className="font-mono">sys.dm_db_missing_index_*</code> DMVs. These reset on SQL
        Server restart.
      </p>

      {suggestions.map((s, idx) => (
        <Card key={idx} className="overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
              <TrendingUp className="h-4 w-4 text-primary" />
              Missing Index #{idx + 1}
              <Badge className="text-[10px]">
                Impact: {s.avgUserImpact.toFixed(0)}%
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {(s.userSeeks + s.userScans).toLocaleString()} queries would benefit
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Improvement Score</p>
              <ImpactBar value={Math.min((s.improvementMeasure / 1000) * 100, 100)} />
              <p className="text-xs text-muted-foreground mt-1">
                Raw score: {s.improvementMeasure.toFixed(0)}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {s.equalityColumns && (
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Equality Columns</p>
                  <p className="font-mono bg-zinc-50 dark:bg-zinc-900 rounded px-2 py-1">
                    {s.equalityColumns}
                  </p>
                </div>
              )}
              {s.inequalityColumns && (
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Inequality Columns</p>
                  <p className="font-mono bg-zinc-50 dark:bg-zinc-900 rounded px-2 py-1">
                    {s.inequalityColumns}
                  </p>
                </div>
              )}
              {s.includedColumns && (
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Included Columns</p>
                  <p className="font-mono bg-zinc-50 dark:bg-zinc-900 rounded px-2 py-1">
                    {s.includedColumns}
                  </p>
                </div>
              )}
            </div>

            <div>
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => setExpandedDDL(expandedDDL === idx ? null : idx)}
              >
                {expandedDDL === idx ? "Hide" : "Show"} suggested DDL
              </button>
              {expandedDDL === idx && (
                <pre className="mt-2 p-3 bg-zinc-900 text-zinc-100 rounded text-xs font-mono overflow-auto whitespace-pre-wrap">
                  {s.suggestedDDL}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
