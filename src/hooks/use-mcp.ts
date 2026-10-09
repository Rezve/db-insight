"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export interface McpPending {
  id: string;
  tool: string;
  sql: string;
  client: string;
  createdAt: number;
}

export interface McpStatusData {
  enabled: boolean;
  requireApproval: boolean;
  allowedForSession: boolean;
  url: string;
  pending: McpPending[];
  token?: string;
}

export interface McpUpdate {
  enabled?: boolean;
  requireApproval?: boolean;
  allowedForSession?: boolean;
  refreshToken?: boolean;
}

export async function decideMcp(id: string, approve: boolean, allowSession = false): Promise<void> {
  try {
    await fetch("/api/mcp/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, approve, allowSession }),
    });
  } catch {
    toast.error("Could not send decision");
  }
}

/** Polls MCP status (fast while enabled so pending requests surface promptly). */
export function useMcp() {
  const [status, setStatus] = useState<McpStatusData | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/status", { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } catch {
      // transient; next poll will retry
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enabled = status?.enabled ?? false;
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [enabled, refresh]);

  const update = useCallback(async (body: McpUpdate): Promise<boolean> => {
    try {
      const res = await fetch("/api/mcp/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStatus(data);
      return true;
    } catch {
      toast.error("Could not update MCP settings");
      return false;
    }
  }, []);

  return { status, refresh, update };
}
