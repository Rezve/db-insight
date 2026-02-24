// Shared utilities for SQL Server execution plan parsing and analysis.
// Used by QueryPlanVisualizer.tsx (SVG tree) and QueryPlanText.tsx (plain English).

export type NodeCategory =
  | "seek"
  | "scan"
  | "indexScan"
  | "keyLookup"
  | "join"
  | "aggregate"
  | "sort"
  | "other";

export interface PlanNode {
  id: string;
  physicalOp: string;
  logicalOp: string;
  estimateRows: number;
  estimateCost: number; // EstimatedTotalSubtreeCost
  costPercent: number; // estimateCost / rootCost * 100
  table?: string;
  index?: string;
  schema?: string;
  warnings: string[];
  children: PlanNode[];
  // SVG layout (assigned by assignLayout)
  x: number;
  y: number;
  subtreePixelH: number;
}

// ── XML Parsing ──────────────────────────────────────────────────────────────

function buildNode(
  relOp: Element,
  counter: { n: number },
  rootCost: number
): PlanNode {
  const id = `node-${counter.n++}`;
  const physicalOp = relOp.getAttribute("PhysicalOp") ?? "Unknown";
  const logicalOp = relOp.getAttribute("LogicalOp") ?? physicalOp;
  const estimateRows = parseFloat(relOp.getAttribute("EstimateRows") ?? "1");
  const estimateCost = parseFloat(
    relOp.getAttribute("EstimatedTotalSubtreeCost") ?? "0"
  );
  const costPercent = rootCost > 0 ? (estimateCost / rootCost) * 100 : 0;

  // Find table/index: look inside each direct child's children for <Object>
  let table: string | undefined;
  let index: string | undefined;
  let schema: string | undefined;
  for (const opChild of Array.from(relOp.children)) {
    for (const grandchild of Array.from(opChild.children)) {
      if (grandchild.localName === "Object") {
        table = grandchild.getAttribute("Table")?.replace(/\[|\]/g, "") ?? undefined;
        index = grandchild.getAttribute("Index")?.replace(/\[|\]/g, "") ?? undefined;
        schema = grandchild.getAttribute("Schema")?.replace(/\[|\]/g, "") ?? undefined;
        break;
      }
    }
    if (table) break;
  }

  // Find warnings
  const warnings: string[] = [];
  for (const opChild of Array.from(relOp.children)) {
    for (const grandchild of Array.from(opChild.children)) {
      if (grandchild.localName === "Warnings") {
        if (grandchild.hasAttribute("NoJoinPredicate"))
          warnings.push("No join predicate — possible cross join");
        if (grandchild.hasAttribute("SpillLevel"))
          warnings.push("Spilled to TempDB during execution");
        if (grandchild.hasAttribute("UnmatchedIndexes"))
          warnings.push("Unmatched indexes detected");
      }
    }
  }

  // Find child RelOp elements (grandchildren of this RelOp through op element)
  const childRelOps: Element[] = [];
  for (const opChild of Array.from(relOp.children)) {
    // Skip non-operation children like OutputList, Warnings
    const localName = opChild.localName;
    if (localName === "OutputList" || localName === "Warnings") continue;
    for (const grandchild of Array.from(opChild.children)) {
      if (grandchild.localName === "RelOp") {
        childRelOps.push(grandchild);
      }
    }
  }

  const children = childRelOps.map((c) => buildNode(c, counter, rootCost));

  return {
    id,
    physicalOp,
    logicalOp,
    estimateRows,
    estimateCost,
    costPercent,
    table,
    index,
    schema,
    warnings,
    children,
    x: 0,
    y: 0,
    subtreePixelH: 0,
  };
}

export function parsePlanXml(xml: string): PlanNode | null {
  if (!xml?.trim()) return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    if (doc.querySelector("parsererror")) return null;

    // getElementsByTagName is namespace-agnostic — works with all SQL Server versions
    const relOps = doc.getElementsByTagName("RelOp");
    if (!relOps.length) return null;

    const rootRelOp = relOps[0];
    const rootCost = parseFloat(
      rootRelOp.getAttribute("EstimatedTotalSubtreeCost") ?? "1"
    );

    const counter = { n: 0 };
    const root = buildNode(rootRelOp, counter, rootCost);
    assignLayout(root, 0, 16);
    return root;
  } catch {
    return null;
  }
}

// ── SVG Layout ───────────────────────────────────────────────────────────────

export const NODE_W = 164;
export const NODE_H = 76;
const H_GAP = 72;
const V_GAP = 14;
const PADDING = 16;

function computeSubtreeH(node: PlanNode): number {
  if (node.children.length === 0) {
    node.subtreePixelH = NODE_H;
    return NODE_H;
  }
  const childrenTotal = node.children.reduce(
    (sum, c) => sum + computeSubtreeH(c),
    0
  );
  const gaps = (node.children.length - 1) * V_GAP;
  node.subtreePixelH = Math.max(NODE_H, childrenTotal + gaps);
  return node.subtreePixelH;
}

function placeNodes(node: PlanNode, depth: number, yTop: number): void {
  node.x = PADDING + depth * (NODE_W + H_GAP);
  node.y = yTop + (node.subtreePixelH - NODE_H) / 2;
  let childY = yTop;
  for (const child of node.children) {
    placeNodes(child, depth + 1, childY);
    childY += child.subtreePixelH + V_GAP;
  }
}

export function assignLayout(root: PlanNode, _depth = 0, _yTop = 0): void {
  computeSubtreeH(root);
  placeNodes(root, 0, PADDING);
}

export function getSvgBounds(node: PlanNode): {
  width: number;
  height: number;
} {
  let maxX = node.x + NODE_W;
  let maxY = node.y + NODE_H;
  for (const child of node.children) {
    const b = getSvgBounds(child);
    if (b.width > maxX) maxX = b.width;
    if (b.height > maxY) maxY = b.height;
  }
  return { width: maxX + PADDING, height: maxY + PADDING };
}

export function edgePath(parent: PlanNode, child: PlanNode): string {
  const x1 = parent.x + NODE_W;
  const y1 = parent.y + NODE_H / 2;
  const x2 = child.x;
  const y2 = child.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

// ── Categories & Colors ───────────────────────────────────────────────────────

export function getNodeCategory(physicalOp: string): NodeCategory {
  const op = physicalOp.toLowerCase();
  if (op === "index seek" || op === "seek rows") return "seek";
  if (op === "table scan" || op === "remote scan") return "scan";
  if (
    op.includes("index scan") ||
    op === "clustered index scan" ||
    op.includes("columnstore")
  )
    return "indexScan";
  if (op === "key lookup" || op === "clustered index seek" && op.includes("lookup"))
    return "keyLookup";
  if (
    op === "nested loops" ||
    op === "merge join" ||
    (op === "hash match" && !op.includes("aggregate"))
  )
    return "join";
  if (op.includes("aggregate") || op === "distinct sort") return "aggregate";
  if (op === "sort") return "sort";
  return "other";
}

// Re-evaluate category based on both physicalOp and logicalOp
export function getNodeCategoryFull(
  physicalOp: string,
  logicalOp: string
): NodeCategory {
  const lop = logicalOp.toLowerCase();
  if (physicalOp.toLowerCase() === "hash match") {
    if (
      lop.includes("aggregate") ||
      lop === "distinct" ||
      lop === "flow distinct"
    )
      return "aggregate";
    return "join";
  }
  if (physicalOp.toLowerCase() === "key lookup") return "keyLookup";
  return getNodeCategory(physicalOp);
}

export const CATEGORY_COLORS: Record<
  NodeCategory,
  { fill: string; stroke: string; text: string; darkFill: string; darkText: string }
> = {
  seek: {
    fill: "#dcfce7",
    stroke: "#16a34a",
    text: "#15803d",
    darkFill: "#14532d",
    darkText: "#86efac",
  },
  scan: {
    fill: "#fee2e2",
    stroke: "#dc2626",
    text: "#b91c1c",
    darkFill: "#450a0a",
    darkText: "#fca5a5",
  },
  indexScan: {
    fill: "#fef3c7",
    stroke: "#d97706",
    text: "#92400e",
    darkFill: "#422006",
    darkText: "#fcd34d",
  },
  keyLookup: {
    fill: "#ffedd5",
    stroke: "#ea580c",
    text: "#c2410c",
    darkFill: "#431407",
    darkText: "#fdba74",
  },
  join: {
    fill: "#dbeafe",
    stroke: "#2563eb",
    text: "#1d4ed8",
    darkFill: "#1e3a5f",
    darkText: "#93c5fd",
  },
  aggregate: {
    fill: "#f3e8ff",
    stroke: "#9333ea",
    text: "#7e22ce",
    darkFill: "#3b0764",
    darkText: "#d8b4fe",
  },
  sort: {
    fill: "#ede9fe",
    stroke: "#7c3aed",
    text: "#5b21b6",
    darkFill: "#2e1065",
    darkText: "#c4b5fd",
  },
  other: {
    fill: "#f4f4f5",
    stroke: "#71717a",
    text: "#3f3f46",
    darkFill: "#27272a",
    darkText: "#a1a1aa",
  },
};

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  seek: "Index Seek",
  scan: "Table Scan",
  indexScan: "Index Scan",
  keyLookup: "Key Lookup",
  join: "Join",
  aggregate: "Aggregate",
  sort: "Sort",
  other: "Other",
};

// ── Post-order Traversal ──────────────────────────────────────────────────────

export function collectPostOrder(node: PlanNode): PlanNode[] {
  const result: PlanNode[] = [];
  function visit(n: PlanNode) {
    for (const child of n.children) visit(child);
    result.push(n);
  }
  visit(node);
  return result;
}

// ── Plain English Descriptions ────────────────────────────────────────────────

export function describeNode(node: PlanNode): string {
  const { physicalOp, logicalOp, estimateRows, table, index, schema } = node;
  const op = physicalOp.toLowerCase();
  const lop = logicalOp.toLowerCase();
  const rowEst = Math.round(estimateRows).toLocaleString();
  const tableRef = table
    ? `[${schema ?? "dbo"}].[${table}]`
    : null;
  const indexRef = index ? `[${index}]` : null;

  if (op === "index seek") {
    return `Navigates directly into ${tableRef ?? "the table"} using ${indexRef ?? "an index"}. SQL Server performs a B-tree lookup — no full scan. Expected to return ${rowEst} row${estimateRows !== 1 ? "s" : ""}.`;
  }
  if (op === "table scan") {
    return `Reads every row in ${tableRef ?? "the table"} from disk. SQL Server found no usable index, so it must examine all rows. Expected to read ${rowEst} rows. Consider adding an index on the filter or join columns.`;
  }
  if (op === "clustered index scan" || op.includes("index scan")) {
    return `Scans all rows in ${tableRef ?? "the table"} via ${indexRef ?? "the clustered index"}. Unlike a Seek, every index row is traversed — potentially expensive on large tables. Expected to return ${rowEst} row${estimateRows !== 1 ? "s" : ""}.`;
  }
  if (op === "key lookup") {
    return `Fetches additional columns from ${tableRef ?? "the table"} by row ID (RID/Key Lookup). The non-clustered index used for seeking did not cover all needed columns, requiring a second look-up into the clustered index per row. Expensive when row count is high. Consider adding the needed columns as INCLUDE columns on the index.`;
  }
  if (op === "nested loops") {
    const joinType = lop.includes("left") ? "left outer" : lop.includes("right") ? "right outer" : "inner";
    return `Joins inputs using Nested Loops (${joinType} join). For each row from the outer input, the inner input is scanned once. Efficient when the outer input is small. Expected to produce ${rowEst} row${estimateRows !== 1 ? "s" : ""}.`;
  }
  if (op === "hash match") {
    if (lop.includes("aggregate") || lop === "distinct" || lop === "flow distinct") {
      return `Computes aggregates (GROUP BY / DISTINCT) by building a hash table in memory. Expected to produce ${rowEst} group${estimateRows !== 1 ? "s" : ""}. If this spills to TempDB, consider an index that pre-sorts the grouping columns.`;
    }
    const joinType = lop.includes("left") ? "left outer" : lop.includes("right") ? "right outer" : lop.includes("full") ? "full outer" : "inner";
    return `Joins inputs using a Hash Match (${joinType} join). Builds a hash table from the smaller input, then probes it with the larger input. Good for large, unsorted datasets. Expected to produce ${rowEst} row${estimateRows !== 1 ? "s" : ""}.`;
  }
  if (op === "merge join") {
    const joinType = lop.includes("left") ? "left outer" : lop.includes("right") ? "right outer" : "inner";
    return `Joins two pre-sorted inputs by merging them in a single pass (${joinType} join). Very efficient when both inputs are already sorted on the join key. Expected to produce ${rowEst} row${estimateRows !== 1 ? "s" : ""}.`;
  }
  if (op === "sort") {
    return `Sorts ${rowEst} rows on one or more columns. Sorting consumes memory proportional to row count and may spill to TempDB on large datasets. An index that provides the required sort order would avoid this operation.`;
  }
  if (op === "stream aggregate") {
    return `Aggregates rows from a pre-sorted stream (GROUP BY / COUNT / SUM, etc.). No hash table needed — very efficient. Expected to produce ${rowEst} group${estimateRows !== 1 ? "s" : ""}.`;
  }
  if (op === "filter") {
    return `Applies a residual filter predicate row-by-row (not satisfied by an index seek predicate). Expected to pass ${rowEst} row${estimateRows !== 1 ? "s" : ""} through. If this filter is selective, consider pushing it into an index.`;
  }
  if (op === "compute scalar") {
    return `Computes a derived column, expression, or scalar function for each row. Expected ${rowEst} row${estimateRows !== 1 ? "s" : ""}.`;
  }
  if (op === "top") {
    return `Returns the first ${rowEst} row${estimateRows !== 1 ? "s" : ""} and stops (TOP N). Efficiently short-circuits downstream processing once the row limit is reached.`;
  }
  if (op === "rml" || op.includes("remote")) {
    return `Executes a remote or distributed query (linked server). Expected to return ${rowEst} row${estimateRows !== 1 ? "s" : ""}.`;
  }
  if (op.includes("bitmap")) {
    return `Applies a Bloom filter bitmap to eliminate rows early in a parallel plan. Expected ${rowEst} row${estimateRows !== 1 ? "s" : ""}.`;
  }
  if (op === "parallelism" || op.includes("gather") || op.includes("repartition")) {
    return `Exchanges rows between parallel threads (${physicalOp}). Indicates this query uses parallelism. Expected ${rowEst} row${estimateRows !== 1 ? "s" : ""}.`;
  }
  // Generic fallback
  return `Executes ${physicalOp} (logical: ${logicalOp}). Expected ${rowEst} row${estimateRows !== 1 ? "s" : ""} at ${node.costPercent.toFixed(1)}% of total plan cost.`;
}

export function isWarningNode(node: PlanNode): boolean {
  const op = node.physicalOp.toLowerCase();
  return (
    op === "table scan" ||
    op === "key lookup" ||
    node.warnings.length > 0 ||
    (op.includes("scan") && node.estimateRows > 10000)
  );
}
