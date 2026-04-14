// Diffing utilities for SQL Server execution plans.
// Takes two PlanNode trees (from queryPlanUtils.parsePlanXml) and produces a
// row-oriented diff with human-readable change descriptions aimed at helping
// a developer decide whether their query edit was an improvement.

import {
  PlanNode,
  collectPostOrder,
  getNodeCategoryFull,
  NodeCategory,
} from "./queryPlanUtils";

export type DiffStatus = "same" | "changed" | "added" | "removed";

export interface PlanDiffRow {
  status: DiffStatus;
  prev?: PlanNode;
  curr?: PlanNode;
  changes: string[];
  // A per-row verdict used to colour the row.
  verdict: "improvement" | "regression" | "neutral";
}

export interface PlanDiff {
  rows: PlanDiffRow[];
  improvementCount: number;
  regressionCount: number;
  changedCount: number;
  sameCount: number;
  // Flags "scan-where-there-was-seek" style regressions even when costs look OK.
  categoryRegression: boolean;
}

// Categories that generally indicate a better access path when they appear
// in the current run vs the previous one. Lower rank = "better".
const CATEGORY_RANK: Record<NodeCategory, number> = {
  seek: 0,
  indexScan: 1,
  keyLookup: 2,
  scan: 3,
  join: 2,
  aggregate: 2,
  sort: 2,
  other: 2,
};

function opKey(node: PlanNode): string {
  // Primary matching key: table + index + physicalOp. Two nodes on the same
  // (table,index) are considered the same logical operation even if cost shifts.
  return `${node.table ?? ""}||${node.index ?? ""}||${node.physicalOp.toLowerCase()}`;
}

function tableKey(node: PlanNode): string {
  return node.table ?? "";
}

export function matchPlanNodes(
  prevRoot: PlanNode | null,
  currRoot: PlanNode | null
): PlanDiffRow[] {
  const prevNodes = prevRoot ? collectPostOrder(prevRoot) : [];
  const currNodes = currRoot ? collectPostOrder(currRoot) : [];

  const rows: PlanDiffRow[] = [];
  const prevUsed = new Set<string>();
  const currUsed = new Set<string>();

  // Pass 1: exact (table, index, physicalOp) match.
  const currByKey = new Map<string, PlanNode[]>();
  for (const c of currNodes) {
    const k = opKey(c);
    if (!currByKey.has(k)) currByKey.set(k, []);
    currByKey.get(k)!.push(c);
  }
  for (const p of prevNodes) {
    const k = opKey(p);
    const bucket = currByKey.get(k);
    if (!bucket || bucket.length === 0) continue;
    const c = bucket.shift()!;
    prevUsed.add(p.id);
    currUsed.add(c.id);
    rows.push(makeRow(p, c));
  }

  // Pass 2: fallback by table name only (catches scan→seek on same table).
  const currByTable = new Map<string, PlanNode[]>();
  for (const c of currNodes) {
    if (currUsed.has(c.id)) continue;
    const t = tableKey(c);
    if (!t) continue;
    if (!currByTable.has(t)) currByTable.set(t, []);
    currByTable.get(t)!.push(c);
  }
  for (const p of prevNodes) {
    if (prevUsed.has(p.id)) continue;
    const t = tableKey(p);
    if (!t) continue;
    const bucket = currByTable.get(t);
    if (!bucket || bucket.length === 0) continue;
    const c = bucket.shift()!;
    prevUsed.add(p.id);
    currUsed.add(c.id);
    rows.push(makeRow(p, c));
  }

  // Removed: in prev but not matched.
  for (const p of prevNodes) {
    if (prevUsed.has(p.id)) continue;
    rows.push({
      status: "removed",
      prev: p,
      changes: [`Removed: ${p.physicalOp}${p.table ? ` on [${p.table}]` : ""}`],
      verdict: isBeneficialRemoval(p) ? "improvement" : "neutral",
    });
  }

  // Added: in curr but not matched.
  for (const c of currNodes) {
    if (currUsed.has(c.id)) continue;
    rows.push({
      status: "added",
      curr: c,
      changes: [`New: ${c.physicalOp}${c.table ? ` on [${c.table}]` : ""}`],
      verdict: isHarmfulAddition(c) ? "regression" : "neutral",
    });
  }

  return rows;
}

function isBeneficialRemoval(node: PlanNode): boolean {
  const cat = getNodeCategoryFull(node.physicalOp, node.logicalOp);
  return cat === "scan" || cat === "keyLookup" || cat === "sort";
}

function isHarmfulAddition(node: PlanNode): boolean {
  const cat = getNodeCategoryFull(node.physicalOp, node.logicalOp);
  return cat === "scan" || cat === "keyLookup" || cat === "sort";
}

function makeRow(prev: PlanNode, curr: PlanNode): PlanDiffRow {
  const changes: string[] = [];
  let verdict: PlanDiffRow["verdict"] = "neutral";

  // PhysicalOp change — strongest signal.
  if (prev.physicalOp.toLowerCase() !== curr.physicalOp.toLowerCase()) {
    const indexRef = curr.index ? ` on [${curr.index}]` : "";
    changes.push(`${prev.physicalOp} → ${curr.physicalOp}${indexRef}`);
    const prevCat = getNodeCategoryFull(prev.physicalOp, prev.logicalOp);
    const currCat = getNodeCategoryFull(curr.physicalOp, curr.logicalOp);
    const prevRank = CATEGORY_RANK[prevCat];
    const currRank = CATEGORY_RANK[currCat];
    if (currRank < prevRank) verdict = "improvement";
    else if (currRank > prevRank) verdict = "regression";
  }

  // Index change.
  if (prev.index !== curr.index && (prev.index || curr.index)) {
    const from = prev.index ? `[${prev.index}]` : "(none)";
    const to = curr.index ? `[${curr.index}]` : "(none)";
    changes.push(`Index: ${from} → ${to}`);
  }

  // Cost percent.
  const costDelta = curr.costPercent - prev.costPercent;
  if (Math.abs(costDelta) >= 5) {
    changes.push(
      `Cost ${prev.costPercent.toFixed(0)}% → ${curr.costPercent.toFixed(0)}% (${
        costDelta >= 0 ? "+" : ""
      }${costDelta.toFixed(0)}pp)`
    );
    if (verdict === "neutral") {
      verdict = costDelta < 0 ? "improvement" : "regression";
    }
  }

  // Estimated row count — flag > 2x ratio either way.
  if (prev.estimateRows > 0 && curr.estimateRows > 0) {
    const ratio = curr.estimateRows / prev.estimateRows;
    if (ratio >= 2 || ratio <= 0.5) {
      changes.push(
        `Est. rows ${formatRows(prev.estimateRows)} → ${formatRows(curr.estimateRows)}`
      );
    }
  }

  // Warnings.
  const prevWarns = new Set(prev.warnings);
  const currWarns = new Set(curr.warnings);
  for (const w of currWarns) {
    if (!prevWarns.has(w)) {
      changes.push(`New warning: ${w}`);
      verdict = "regression";
    }
  }
  for (const w of prevWarns) {
    if (!currWarns.has(w)) {
      changes.push(`Warning cleared: ${w}`);
      if (verdict === "neutral") verdict = "improvement";
    }
  }

  return {
    status: changes.length === 0 ? "same" : "changed",
    prev,
    curr,
    changes,
    verdict,
  };
}

function formatRows(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

export function diffPlans(
  prevRoot: PlanNode | null,
  currRoot: PlanNode | null
): PlanDiff {
  const rows = matchPlanNodes(prevRoot, currRoot);
  let improvementCount = 0;
  let regressionCount = 0;
  let changedCount = 0;
  let sameCount = 0;
  let categoryRegression = false;

  for (const r of rows) {
    if (r.status === "same") sameCount++;
    else changedCount++;
    if (r.verdict === "improvement") improvementCount++;
    if (r.verdict === "regression") {
      regressionCount++;
      categoryRegression = true;
    }
  }

  // Sort: changed/added/removed first (regressions before improvements), then same.
  const statusRank: Record<DiffStatus, number> = { changed: 0, added: 1, removed: 2, same: 3 };
  const verdictRank = { regression: 0, improvement: 1, neutral: 2 };
  rows.sort((a, b) => {
    if (statusRank[a.status] !== statusRank[b.status])
      return statusRank[a.status] - statusRank[b.status];
    return verdictRank[a.verdict] - verdictRank[b.verdict];
  });

  return { rows, improvementCount, regressionCount, changedCount, sameCount, categoryRegression };
}
