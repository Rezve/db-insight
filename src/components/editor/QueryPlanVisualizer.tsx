"use client";

import { useMemo, useState } from "react";
import { Maximize2, Info, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  parsePlanXml,
  getSvgBounds,
  edgePath,
  getNodeCategoryFull,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  NODE_W,
  NODE_H,
  type PlanNode,
  type NodeCategory,
} from "./queryPlanUtils";

// ── Node rendering ────────────────────────────────────────────────────────────

const LABEL_MAX = 19;
const TABLE_MAX = 22;

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

interface PlanNodeSvgProps {
  node: PlanNode;
  selected: boolean;
  onSelect: (n: PlanNode) => void;
}

function PlanNodeSvg({ node, selected, onSelect }: PlanNodeSvgProps) {
  const category = getNodeCategoryFull(node.physicalOp, node.logicalOp);
  const colors = CATEGORY_COLORS[category];
  const label = truncate(node.physicalOp, LABEL_MAX);
  const tableLabel = node.table
    ? `[${node.table}]`
    : node.index
    ? `[${node.index}]`
    : "";
  const rowsLabel = `${Math.round(node.estimateRows).toLocaleString()} rows`;
  const costLabel = `${node.costPercent.toFixed(1)}%`;
  const hasWarning = node.warnings.length > 0;

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      onClick={() => onSelect(node)}
      style={{ cursor: "pointer" }}
      role="button"
      aria-label={node.physicalOp}
    >
      {/* Shadow */}
      <rect
        x={2}
        y={3}
        width={NODE_W}
        height={NODE_H}
        rx={7}
        fill="rgba(0,0,0,0.06)"
      />
      {/* Background */}
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={7}
        fill={colors.fill}
        stroke={selected ? "#0f172a" : colors.stroke}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      {/* Cost bar at bottom */}
      <rect
        x={0}
        y={NODE_H - 5}
        width={Math.max(6, (node.costPercent / 100) * NODE_W)}
        height={5}
        rx={3}
        fill={colors.stroke}
        opacity={0.35}
      />

      {/* Operation name */}
      <text
        x={10}
        y={22}
        fontSize={11}
        fontWeight="600"
        fill={colors.text}
        fontFamily="ui-monospace, monospace"
      >
        {label}
      </text>

      {/* Table/index */}
      {tableLabel && (
        <text
          x={10}
          y={38}
          fontSize={10}
          fill="#6b7280"
          fontFamily="ui-monospace, monospace"
        >
          {truncate(tableLabel, TABLE_MAX)}
        </text>
      )}

      {/* Index (when table is also shown) */}
      {node.table && node.index && (
        <text
          x={10}
          y={53}
          fontSize={9}
          fill="#9ca3af"
          fontFamily="ui-monospace, monospace"
        >
          {truncate(`via [${node.index}]`, TABLE_MAX + 5)}
        </text>
      )}

      {/* Stats row */}
      <text
        x={10}
        y={node.table && node.index ? 66 : tableLabel ? 54 : 42}
        fontSize={9}
        fill="#9ca3af"
        fontFamily="ui-monospace, monospace"
      >
        {rowsLabel} · {costLabel}
      </text>

      {/* Warning badge */}
      {hasWarning && (
        <g transform={`translate(${NODE_W - 18}, 8)`}>
          <circle r={7} fill="#dc2626" />
          <text
            x={0}
            y={4}
            textAnchor="middle"
            fontSize={10}
            fontWeight="700"
            fill="white"
          >
            !
          </text>
        </g>
      )}
    </g>
  );
}

// ── Recursive tree renderer ───────────────────────────────────────────────────

interface PlanTreeProps {
  node: PlanNode;
  selectedId: string | null;
  onSelect: (n: PlanNode) => void;
}

function PlanTree({ node, selectedId, onSelect }: PlanTreeProps) {
  return (
    <g>
      {node.children.map((child) => (
        <path
          key={`edge-${node.id}-${child.id}`}
          d={edgePath(node, child)}
          fill="none"
          stroke="#d1d5db"
          strokeWidth={1.5}
          strokeDasharray={child.physicalOp === "Parallelism" ? "4 2" : undefined}
        />
      ))}
      <PlanNodeSvg
        node={node}
        selected={node.id === selectedId}
        onSelect={onSelect}
      />
      {node.children.map((child) => (
        <PlanTree
          key={child.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </g>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

const LEGEND_CATEGORIES: NodeCategory[] = [
  "seek",
  "indexScan",
  "scan",
  "keyLookup",
  "join",
  "aggregate",
  "sort",
];

function Legend() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {LEGEND_CATEGORIES.map((cat) => {
        const c = CATEGORY_COLORS[cat];
        return (
          <span key={cat} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm border"
              style={{ backgroundColor: c.fill, borderColor: c.stroke }}
            />
            {CATEGORY_LABELS[cat]}
          </span>
        );
      })}
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

interface DetailPanelProps {
  node: PlanNode;
  onClose: () => void;
}

function DetailPanel({ node, onClose }: DetailPanelProps) {
  const fields: { label: string; value: string }[] = [
    { label: "Physical Op", value: node.physicalOp },
    { label: "Logical Op", value: node.logicalOp },
    ...(node.schema && node.table
      ? [{ label: "Table", value: `[${node.schema}].[${node.table}]` }]
      : []),
    ...(node.index ? [{ label: "Index", value: `[${node.index}]` }] : []),
    { label: "Est. Rows", value: node.estimateRows.toLocaleString() },
    { label: "Subtree Cost", value: `${node.estimateCost.toFixed(5)} (${node.costPercent.toFixed(2)}%)` },
  ];

  return (
    <div className="border-t bg-muted/30 p-3 shrink-0">
      <div className="flex items-start gap-3">
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
          {fields.map((f) => (
            <div key={f.label} className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {f.label}
              </p>
              <p className="text-[11px] font-mono font-medium truncate" title={f.value}>
                {f.value}
              </p>
            </div>
          ))}
          {node.warnings.length > 0 && (
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                Warnings
              </p>
              {node.warnings.map((w, i) => (
                <p
                  key={i}
                  className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── SVG canvas (reused in normal and fullscreen views) ────────────────────────

interface PlanCanvasProps {
  root: PlanNode;
  selectedId: string | null;
  onSelect: (n: PlanNode) => void;
}

function PlanCanvas({ root, selectedId, onSelect }: PlanCanvasProps) {
  const bounds = useMemo(() => getSvgBounds(root), [root]);

  return (
    <div className="overflow-auto h-full w-full p-4">
      <svg
        width={bounds.width}
        height={bounds.height}
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        style={{ display: "block", minWidth: bounds.width }}
      >
        <PlanTree node={root} selectedId={selectedId} onSelect={onSelect} />
      </svg>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface QueryPlanVisualizerProps {
  planXml: string | undefined;
}

export default function QueryPlanVisualizer({ planXml }: QueryPlanVisualizerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const root = useMemo(() => {
    if (!planXml) return null;
    return parsePlanXml(planXml);
  }, [planXml]);

  const selectedNode = useMemo(() => {
    if (!root || !selectedId) return null;
    const find = (n: PlanNode): PlanNode | null => {
      if (n.id === selectedId) return n;
      for (const c of n.children) {
        const found = find(c);
        if (found) return found;
      }
      return null;
    };
    return find(root);
  }, [root, selectedId]);

  const handleSelect = (n: PlanNode) => {
    setSelectedId((prev) => (prev === n.id ? null : n.id));
  };

  if (!planXml) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-sm p-8 text-center">
        <Info className="h-8 w-8 opacity-40" />
        <p>
          Enable <span className="font-semibold">Query Plan</span> and run a
          query to see the visual execution plan.
        </p>
      </div>
    );
  }

  if (!root) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-sm p-8 text-center">
        <AlertCircle className="h-8 w-8 opacity-40" />
        <p>Could not parse the execution plan XML.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b shrink-0">
        <Legend />
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs h-7"
          onClick={() => setFullscreen(true)}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Fullscreen
        </Button>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden min-h-0">
        <PlanCanvas root={root} selectedId={selectedId} onSelect={handleSelect} />
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <DetailPanel node={selectedNode} onClose={() => setSelectedId(null)} />
      )}

      {/* Fullscreen dialog */}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent
          className="max-w-[96vw] w-[96vw] h-[92vh] flex flex-col p-0 gap-0 overflow-hidden"
          showCloseButton={false}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
            <DialogTitle className="text-sm font-semibold">
              Execution Plan
            </DialogTitle>
            <div className="flex items-center gap-3">
              <Legend />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setFullscreen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden min-h-0">
            <PlanCanvas root={root} selectedId={selectedId} onSelect={handleSelect} />
          </div>

          {selectedNode && (
            <DetailPanel
              node={selectedNode}
              onClose={() => setSelectedId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
