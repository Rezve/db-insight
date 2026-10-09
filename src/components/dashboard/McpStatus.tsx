"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { decideMcp, useMcp } from "@/hooks/use-mcp";

const MCP_PATH = "/dashboard/mcp";

/** Header entry point for MCP: a link to the MCP page, plus approval toasts. */
export default function McpStatus() {
  const { status, refresh } = useMcp();
  const pathname = usePathname();
  const shown = useRef(new Set<string>());

  const enabled = status?.enabled ?? false;
  const pending = status?.pending;
  const onMcpPage = pathname === MCP_PATH;

  // One actionable toast per pending request; dismissed once it is decided or times out.
  useEffect(() => {
    const ids = new Set((pending ?? []).map((p) => p.id));
    for (const id of shown.current) {
      if (!ids.has(id) || onMcpPage) {
        toast.dismiss(id);
        shown.current.delete(id);
      }
    }
    if (onMcpPage) return;
    for (const p of pending ?? []) {
      if (shown.current.has(p.id)) continue;
      shown.current.add(p.id);
      const decide = async (approve: boolean, allowSession = false) => {
        await decideMcp(p.id, approve, allowSession);
        refresh();
      };
      toast(`${p.client} wants to run a query`, {
        id: p.id,
        description: (
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
            {p.sql.length > 400 ? `${p.sql.slice(0, 400)}…` : p.sql}
          </pre>
        ),
        duration: Infinity,
        action: { label: "Allow", onClick: () => decide(true) },
        cancel: { label: "Deny", onClick: () => decide(false) },
      });
    }
  }, [pending, onMcpPage, refresh]);

  const count = pending?.length ?? 0;

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="relative h-6 w-6 p-0 text-muted-foreground hover:text-primary"
    >
      <Link href={MCP_PATH} title={enabled ? "MCP server is on" : "MCP server is off"}>
        <Plug className="h-3.5 w-3.5" />
        {enabled && (
          <span
            className={cn(
              "absolute right-0 top-0 h-2 w-2 rounded-full ring-2 ring-background",
              count > 0 ? "animate-pulse bg-amber-500" : "bg-emerald-500"
            )}
          />
        )}
      </Link>
    </Button>
  );
}
