import { randomUUID } from "crypto";

export interface PendingApproval {
  id: string;
  tool: string;
  sql: string;
  client: string;
  createdAt: number;
}

export type ApprovalDecision = "approved" | "denied" | "timeout";

interface Entry extends PendingApproval {
  settle: (decision: ApprovalDecision) => void;
}

declare global {
  // eslint-disable-next-line no-var
  var __mcpPending: Map<string, Map<string, Entry>> | undefined;
}

const pending: Map<string, Map<string, Entry>> = global.__mcpPending ?? (global.__mcpPending = new Map());

export const APPROVAL_TIMEOUT_MS = 60_000;

/** Parks a request until the user approves or denies it in the UI (or it times out). */
export function requestApproval(
  sessionId: string,
  request: { tool: string; sql: string; client: string }
): Promise<ApprovalDecision> {
  return new Promise((resolve) => {
    const id = randomUUID();
    let bucket = pending.get(sessionId);
    if (!bucket) pending.set(sessionId, (bucket = new Map()));

    const timer = setTimeout(() => settle("timeout"), APPROVAL_TIMEOUT_MS);
    const settle = (decision: ApprovalDecision) => {
      clearTimeout(timer);
      const b = pending.get(sessionId);
      b?.delete(id);
      if (b && b.size === 0) pending.delete(sessionId);
      resolve(decision);
    };
    bucket.set(id, { id, ...request, createdAt: Date.now(), settle });
  });
}

export function listPending(sessionId: string): PendingApproval[] {
  return [...(pending.get(sessionId)?.values() ?? [])].map(({ settle: _settle, ...rest }) => rest);
}

/** Returns false if the request no longer exists (already decided or timed out). */
export function decide(sessionId: string, id: string, approved: boolean): boolean {
  const entry = pending.get(sessionId)?.get(id);
  if (!entry) return false;
  entry.settle(approved ? "approved" : "denied");
  return true;
}

/** Approves everything outstanding, used after the user allows queries for the session. */
export function approveAll(sessionId: string): void {
  for (const entry of [...(pending.get(sessionId)?.values() ?? [])]) entry.settle("approved");
}

/** Denies everything outstanding, e.g. when MCP is turned off. */
export function denyAll(sessionId: string): void {
  for (const entry of [...(pending.get(sessionId)?.values() ?? [])]) entry.settle("denied");
}
