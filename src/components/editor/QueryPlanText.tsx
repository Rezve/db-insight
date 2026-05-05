"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Info, Lightbulb, Copy, Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  parsePlanXml,
  collectPostOrder,
  describeNode,
  isWarningNode,
  getNodeCategoryFull,
  CATEGORY_COLORS,
  parseMissingIndexes,
  generateMissingIndexSql,
  type MissingIndexHint,
} from "./queryPlanUtils";

function MissingIndexCallout({ hints }: { hints: MissingIndexHint[] }) {
  const [copied, setCopied] = useState<number | null>(null);
  if (hints.length === 0) return null;

  function copyIndex(hint: MissingIndexHint, i: number) {
    navigator.clipboard.writeText(generateMissingIndexSql(hint)).then(() => {
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="mx-4 mt-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 shrink-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-200 dark:border-amber-800/60">
        <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
          {hints.length} missing index recommendation{hints.length !== 1 ? "s" : ""} from SQL Server
        </span>
      </div>
      <div className="divide-y divide-amber-200 dark:divide-amber-800/40">
        {hints.map((hint, i) => {
          const keyCols = [...hint.equalityColumns, ...hint.inequalityColumns];
          return (
            <div key={i} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0 text-xs space-y-0.5">
                <span className="font-mono font-medium text-amber-900 dark:text-amber-200">
                  [{hint.schema}].[{hint.table}]
                </span>
                <div className="text-amber-700 dark:text-amber-400 space-x-2">
                  {keyCols.length > 0 && (
                    <span>Key: {keyCols.map((c) => `[${c}]`).join(", ")}</span>
                  )}
                  {hint.includeColumns.length > 0 && (
                    <span className="opacity-80">Include: {hint.includeColumns.map((c) => `[${c}]`).join(", ")}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-mono text-amber-700 dark:text-amber-400 whitespace-nowrap">
                  {hint.impact.toFixed(1)}% impact
                </span>
                <button
                  className="h-6 w-6 p-0 flex items-center justify-center rounded hover:bg-amber-200 dark:hover:bg-amber-800/50 text-amber-700 dark:text-amber-400"
                  title="Copy CREATE INDEX statement"
                  onClick={() => copyIndex(hint, i)}
                >
                  {copied === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

  const missingIndexes = useMemo(() => parseMissingIndexes(planXml ?? ""), [planXml]);

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

      <MissingIndexCallout hints={missingIndexes} />

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
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`text-[11px] font-mono font-medium cursor-default ${
                                node.costPercent > 50
                                  ? "text-red-600 dark:text-red-400"
                                  : node.costPercent > 20
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {node.costPercent.toFixed(1)}%
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-[240px] text-xs space-y-1.5">
                            <p>
                              <strong>{node.costPercent.toFixed(1)}%</strong> of
                              the total query cost flows through this step and
                              everything beneath it.
                            </p>
                            <p className="text-muted-foreground">
                              Percentages don&apos;t add up to 100% — parent
                              steps include their children&apos;s cost, so
                              numbers naturally overlap.
                            </p>
                            {node.costPercent > 50 ? (
                              <p className="text-red-400">
                                High share — this subtree is the dominant cost
                                driver. Focus optimization here first.
                              </p>
                            ) : node.costPercent > 20 ? (
                              <p className="text-amber-400">
                                Moderate share — worth checking indexes or join
                                order for this subtree.
                              </p>
                            ) : (
                              <p className="text-muted-foreground">
                                Low share — unlikely to be a bottleneck.
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
