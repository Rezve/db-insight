"use client";

import { useRef, useState } from "react";
import { ArrowUpCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUpdateContext } from "@/contexts/update-context";

type Phase = "idle" | "updating" | "done" | "error";

export default function UpdateChecker() {
  const { updateAvailable, commitsBehind } = useUpdateContext();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  function appendLog(line: string) {
    setLogs((prev) => [...prev, line]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
  }

  async function handleUpdate() {
    setPhase("updating");
    setLogs([]);
    setErrorMsg("");

    try {
      const res = await fetch("/api/app-update/apply", { method: "POST" });
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "log") {
              appendLog(event.line);
            } else if (event.type === "complete") {
              setPhase("done");
            } else if (event.type === "error") {
              setErrorMsg(event.message);
              setPhase("error");
            }
          } catch {
            // ignore malformed SSE line
          }
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Update failed");
      setPhase("error");
    }
  }

  async function handleRestart() {
    appendLog(
      "\nServer is restarting. If it doesn't come back automatically, run: npm run start"
    );
    await fetch("/api/app-update/restart", { method: "POST" }).catch(() => {});
  }

  if (!updateAvailable) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 hover:bg-amber-500/25 dark:text-amber-400 transition-colors"
        title={`${commitsBehind} new commit${commitsBehind > 1 ? "s" : ""} available`}
      >
        <ArrowUpCircle className="h-3 w-3" />
        {commitsBehind} update{commitsBehind > 1 ? "s" : ""}
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => phase !== "updating" && setOpen(v)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-amber-500" />
              Update Available
            </DialogTitle>
            <DialogDescription>
              {commitsBehind} new commit{commitsBehind > 1 ? "s" : ""} on
              origin. Click &ldquo;Update Now&rdquo; to pull and rebuild
              automatically.
            </DialogDescription>
          </DialogHeader>

          {(phase !== "idle" || logs.length > 0) && (
            <ScrollArea className="h-56 rounded-md border bg-zinc-950 p-3">
              <pre className="whitespace-pre-wrap break-all font-mono text-xs text-zinc-200">
                {logs.join("\n")}
                {phase === "error" && (
                  <span className="text-red-400">{"\n\nError: " + errorMsg}</span>
                )}
                {phase === "done" && (
                  <span className="text-green-400">{"\n\nBuild complete."}</span>
                )}
              </pre>
              <div ref={bottomRef} />
            </ScrollArea>
          )}

          <div className="flex justify-end gap-2 pt-1">
            {phase === "idle" && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Later
                </Button>
                <Button size="sm" onClick={handleUpdate}>
                  Update Now
                </Button>
              </>
            )}

            {phase === "updating" && (
              <Button size="sm" disabled>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Updating…
              </Button>
            )}

            {phase === "done" && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button size="sm" onClick={handleRestart}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Restart Server
                </Button>
              </>
            )}

            {phase === "error" && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setPhase("idle");
                    setLogs([]);
                  }}
                >
                  Retry
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
