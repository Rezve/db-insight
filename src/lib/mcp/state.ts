import { createHash, randomBytes } from "crypto";
import { getCredentials } from "@/lib/session-store";
import { getMcpToken, setMcpToken } from "@/lib/editor-db";

/**
 * In-memory MCP state, per live database session. Deliberately not persisted:
 * MCP is off after a restart, disconnect or reconnect and must be turned on again.
 */
export interface McpSessionState {
  tokenHash: string;
  token: string;
  serverName: string;
  databaseName: string;
  requireApproval: boolean;
  /** User chose "allow for this session": queries run without asking until MCP is turned off or re-enabled. */
  allowedForSession: boolean;
  enabledAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __mcpBySession: Map<string, McpSessionState> | undefined;
  // eslint-disable-next-line no-var
  var __mcpByToken: Map<string, string> | undefined;
}

const bySession: Map<string, McpSessionState> = global.__mcpBySession ?? (global.__mcpBySession = new Map());
const byTokenHash: Map<string, string> = global.__mcpByToken ?? (global.__mcpByToken = new Map());

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Turns MCP on for a session. The bearer token is persisted per server/database and reused
 * across restarts and reconnects; it only changes when `rotate` is set.
 */
export function enableMcp(
  sessionId: string,
  info: { serverName: string; databaseName: string; requireApproval?: boolean; rotate?: boolean }
): string {
  const previous = bySession.get(sessionId);
  if (previous) byTokenHash.delete(previous.tokenHash);

  let token = info.rotate ? null : getMcpToken(info.serverName, info.databaseName);
  if (!token) {
    token = `dbi_${randomBytes(32).toString("base64url")}`;
    setMcpToken(info.serverName, info.databaseName, token);
  }
  const tokenHash = hash(token);
  bySession.set(sessionId, {
    tokenHash,
    token,
    serverName: info.serverName,
    databaseName: info.databaseName,
    requireApproval: info.requireApproval ?? previous?.requireApproval ?? true,
    allowedForSession: Boolean(previous?.allowedForSession),
    enabledAt: Date.now(),
  });
  byTokenHash.set(tokenHash, sessionId);
  return token;
}

export function disableMcp(sessionId: string): void {
  const state = bySession.get(sessionId);
  if (state && byTokenHash.get(state.tokenHash) === sessionId) byTokenHash.delete(state.tokenHash);
  bySession.delete(sessionId);
}

export function getMcpState(sessionId: string): McpSessionState | undefined {
  return bySession.get(sessionId);
}

export function setRequireApproval(sessionId: string, value: boolean): void {
  const state = bySession.get(sessionId);
  if (state) state.requireApproval = value;
}

export function setAllowedForSession(sessionId: string, value: boolean): void {
  const state = bySession.get(sessionId);
  if (state) state.allowedForSession = value;
}

/** The session a bearer token belongs to, if MCP is on and the connection is still live. */
export function resolveToken(token: string): { sessionId: string; state: McpSessionState } | null {
  const sessionId = byTokenHash.get(hash(token));
  if (!sessionId) return null;
  const state = bySession.get(sessionId);
  if (!state || !getCredentials(sessionId)) return null;
  return { sessionId, state };
}
