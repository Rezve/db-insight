"use client";

import { useMemo } from "react";
import { AlertCircle, Info } from "lucide-react";
import {
  parsePlanXml,
  collectPostOrder,
  describeNode,
  isWarningNode,
  getNodeCategoryFull,
  CATEGORY_COLORS,
} from "./queryPlanUtils";

interface QueryPlanTextProps {
  planXml: string | undefined;
}

export default function QueryPlanText({ planXml }: QueryPlanTextProps) {
  const steps = useMemo(() => {
    if (!planXml) return null;
    const root = parsePlanXml(planXml);
    if (!root) return null;
    return collectPostOrder(root);
  }, [planXml]);

  if (!planXml) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-sm p-8 text-center">
        <Info className="h-8 w-8 opacity-40" />
        <p>Enable <span className="font-semibold">Query Plan</span> and run a query to see the execution analysis.</p>
      </div>
    );
  }

  if (!steps) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-sm p-8 text-center">
        <AlertCircle className="h-8 w-8 opacity-40" />
        <p>Could not parse the execution plan XML.</p>
      </div>
    );
  }

  const warnings = steps.filter((n) => isWarningNode(n));

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-4 pt-3 pb-2 shrink-0 border-b">
        <p className="text-xs text-muted-foreground">
          Steps shown in execution order — data access operations first (right-to-left read), final output last.{" "}
          {warnings.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {warnings.length} potential issue{warnings.length !== 1 ? "s" : ""} found.
            </span>
          )}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-2.5">
        {steps.map((node, i) => {
          const category = getNodeCategoryFull(node.physicalOp, node.logicalOp);
          const colors = CATEGORY_COLORS[category];
          const warn = isWarningNode(node);
          const description = describeNode(node);

          return (
            <div
              key={node.id}
              className={`rounded-lg border text-sm transition-colors ${
                warn
                  ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-start gap-3 p-3">
                {/* Step number */}
                <span className="text-[11px] font-mono text-muted-foreground mt-0.5 shrink-0 w-5 text-right select-none">
                  {i + 1}.
                </span>

                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Header row: operation badge + table + cost */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold border shrink-0"
                      style={{
                        backgroundColor: colors.fill,
                        borderColor: colors.stroke,
                        color: colors.text,
                      }}
                    >
                      {node.physicalOp}
                    </span>

                    {node.table && (
                      <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[200px]">
                        [{node.schema ?? "dbo"}].[{node.table}]
                      </span>
                    )}

                    {node.index && !node.table && (
                      <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[200px]">
                        [{node.index}]
                      </span>
                    )}

                    <div className="ml-auto flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {Math.round(node.estimateRows).toLocaleString()} rows
                      </span>
                      <span
                        className={`text-[11px] font-mono font-medium ${
                          node.costPercent > 50
                            ? "text-red-600 dark:text-red-400"
                            : node.costPercent > 20
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {node.costPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Index detail when both table and index are present */}
                  {node.table && node.index && (
                    <p className="text-[11px] font-mono text-muted-foreground">
                      using [{node.index}]
                    </p>
                  )}

                  {/* Plain English description */}
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    {description}
                  </p>

                  {/* Warnings */}
                  {node.warnings.length > 0 && (
                    <div className="space-y-0.5 pt-0.5">
                      {node.warnings.map((w, wi) => (
                        <p
                          key={wi}
                          className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5"
                        >
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          {w}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
