"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Plug, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { decideMcp, useMcp } from "@/hooks/use-mcp";

interface AuditEntry {
  id: number;
  ts: string;
  client: string;
  tool: string;
  input: string;
  outcome: string;
  rowCount: number | null;
  durationMs: number | null;
  detail: string | null;
}

type ApprovalMode = "ask" | "session" | "auto";

const APPROVAL_MODES: {
  id: ApprovalMode;
  label: string;
  hint: string;
  body: { requireApproval: boolean; allowedForSession: boolean };
}[] = [
  { id: "ask", label: "Ask each time", hint: "Review every query", body: { requireApproval: true, allowedForSession: false } },
  { id: "session", label: "Allow this session", hint: "Until MCP is turned off", body: { requireApproval: true, allowedForSession: true } },
  { id: "auto", label: "Auto-accept", hint: "Never ask", body: { requireApproval: false, allowedForSession: false } },
];

const OUTCOME_STYLE: Record<string, string> = {
  ok: "text-emerald-600",
  approved: "text-emerald-600",
  denied: "text-amber-600",
  timeout: "text-amber-600",
  blocked: "text-destructive",
  error: "text-destructive",
};

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
        checked ? "bg-emerald-500 border-emerald-500" : "bg-muted border-border"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all",
          checked ? "left-[18px]" : "left-0.5"
        )}
      />
    </button>
  );
}

export default function McpPage() {
  const { status, refresh, update } = useMcp();
  const [log, setLog] = useState<AuditEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const enabled = status?.enabled ?? false;
  const token = status?.token ?? null;
  const pending = status?.pending ?? [];
  const mode: ApprovalMode = !status?.requireApproval ? "auto" : status.allowedForSession ? "session" : "ask";

  const refreshLog = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/log", { cache: "no-store" });
      if (res.ok) setLog((await res.json()).entries);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (enabled) refreshLog();
  }, [enabled, refreshLog, pending.length]);

  async function refreshToken() {
    if (!window.confirm("Generate a new token? Clients using the current token will stop working until updated.")) return;
    if (await update({ refreshToken: true })) toast.success("New token generated");
  }

  async function decide(id: string, approve: boolean, allowSession = false) {
    await decideMcp(id, approve, allowSession);
    refresh();
  }

  async function clearLog() {
    try {
      const res = await fetch("/api/mcp/log", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setLog([]);
    } catch {
      toast.error("Could not clear the activity log");
    }
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  const snippet = status
    ? JSON.stringify(
        {
          mcpServers: {
            "db-insight": {
              type: "http",
              url: status.url,
              headers: { Authorization: `Bearer ${token ?? "<token>"}` },
            },
          },
        },
        null,
        2
      )
    : "";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Plug className="h-4 w-4" />
            MCP server
            <span className={cn("h-2 w-2 rounded-full", enabled ? "bg-emerald-500" : "bg-muted-foreground/40")} />
            <span className="text-sm font-normal text-muted-foreground">{enabled ? "on" : "off"}</span>
          </h1>
          <p className="mt-1 text-muted-foreground">
            Lets LLM tools read this database&apos;s schema, indexes and performance data, and run read-only queries.
          </p>
        </div>
        <Switch checked={enabled} onChange={(v) => update({ enabled: v })} label="Toggle MCP server" />
      </div>

      {enabled && status && (
        <>
          <section className="rounded-lg border p-4">
            <div className="mb-3 flex items-center gap-1.5 font-medium">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Query approval
            </div>
            <div role="radiogroup" aria-label="Query approval mode" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {APPROVAL_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={m.id === mode}
                  onClick={() => update(m.body)}
                  className={cn(
                    "rounded border px-3 py-2 text-left transition-colors",
                    m.id === mode ? "border-primary bg-primary/5" : "hover:bg-muted"
                  )}
                >
                  <div className="font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{m.hint}</div>
                </button>
              ))}
            </div>
            {mode === "auto" && (
              <p className="mt-3 text-amber-600">
                Every valid read-only query from connected clients runs immediately. Turn this off if you are unsure who
                has the token.
              </p>
            )}
          </section>

          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-medium text-amber-600">Waiting for your review</h2>
              {pending.map((p) => (
                <div key={p.id} className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                  <div className="mb-1 text-muted-foreground">
                    {p.tool} · {p.client}
                  </div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-xs">
                    {p.sql}
                  </pre>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => decide(p.id, false)}>
                      Deny
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => decide(p.id, true, true)}>
                      Allow for this session
                    </Button>
                    <Button size="sm" onClick={() => decide(p.id, true)}>
                      Allow once
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="space-y-4 rounded-lg border p-4">
            <div>
              <div className="mb-1 font-medium">Endpoint</div>
              <div className="flex items-center gap-1">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">{status.url}</code>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copy("url", status.url)}>
                  {copied === "url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">Client config</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={refreshToken}>
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Refresh token
                  </Button>
                  {token && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => copy("cfg", snippet)}>
                      {copied === "cfg" ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                      Copy
                    </Button>
                  )}
                </div>
              </div>
              <pre className="overflow-auto rounded bg-muted p-2 font-mono text-xs">{snippet}</pre>
              {token && (
                <div className="mt-2 flex items-center gap-1">
                  <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">
                    Authorization: Bearer {token}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    title="Copy Authorization header"
                    onClick={() => copy("auth", `Authorization: Bearer ${token}`)}
                  >
                    {copied === "auth" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              )}
              <p className="mt-1 text-muted-foreground">
                This token stays the same across restarts and reconnects. Use Refresh token to replace it if it leaks.
              </p>
            </div>

            <p className="text-muted-foreground">
              Only single SELECT queries are accepted; writes and DDL are rejected. SQL Server has no engine-level
              read-only mode, so also connect with a read-only login. MCP turns off when you disconnect or restart.
            </p>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">Activity</h2>
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={log.length === 0} onClick={clearLog}>
                <Trash2 className="mr-1 h-3 w-3" />
                Clear log
              </Button>
            </div>
            {log.length === 0 ? (
              <p className="text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-1">
                {log.map((e) => (
                  <li key={e.id} className="rounded border px-2 py-1.5" title={e.detail ?? e.input}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono">{e.tool}</span>
                      <span className={cn("font-medium", OUTCOME_STYLE[e.outcome])}>{e.outcome}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {new Date(e.ts).toLocaleTimeString()}
                      {e.rowCount != null && ` · ${e.rowCount} rows`}
                      {e.durationMs != null && ` · ${e.durationMs} ms`}
                      {e.input && ` · ${e.input.replace(/\s+/g, " ")}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
