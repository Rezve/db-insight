"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";

interface ClosedTab {
  id: string;
  name: string;
  sql: string;
  closedAt: string;
}

interface ClosedTabsPanelProps {
  onRestore: (tab: ClosedTab) => void;
}


export default function ClosedTabsPanel({ onRestore }: ClosedTabsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [closedTabs, setClosedTabs] = useState<ClosedTab[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const loadClosedTabs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/closed-tabs");
      const data = await res.json();
      setClosedTabs(data.closedTabs ?? []);
    } catch {
      setClosedTabs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadClosedTabs();
  }, [isOpen, loadClosedTabs]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setConfirmDeleteKey(null);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  async function handleRestore(tab: ClosedTab) {
    onRestore(tab);
    await fetch("/api/closed-tabs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tab.id, closedAt: tab.closedAt }),
    }).catch(() => {});
    setClosedTabs((prev) => prev.filter((t) => !(t.id === tab.id && t.closedAt === tab.closedAt)));
  }

  async function handleDelete(tab: ClosedTab) {
    await fetch("/api/closed-tabs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tab.id, closedAt: tab.closedAt }),
    }).catch(() => {});
    setClosedTabs((prev) => prev.filter((t) => !(t.id === tab.id && t.closedAt === tab.closedAt)));
    setConfirmDeleteKey(null);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        className="flex items-center justify-center w-7 h-7 mx-1 rounded text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
        onClick={() => { setIsOpen((v) => !v); setConfirmDeleteKey(null); }}
        title="Closed tabs"
      >
        <History className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-md border border-border bg-background shadow-md">
          <div className="px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground">
            Closed tabs
          </div>

          {loading ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading...</div>
          ) : closedTabs.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">No closed tabs</div>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {closedTabs.map((tab) => {
                const key = `${tab.id}:${tab.closedAt}`;
                const isConfirming = confirmDeleteKey === key;
                return (
                  <li key={key} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-b border-border last:border-0">
                    {isConfirming ? (
                      <div className="flex items-center gap-2 w-full text-xs">
                        <span className="text-muted-foreground flex-1">Delete permanently?</span>
                        <button
                          className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          onClick={() => setConfirmDeleteKey(null)}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
                          onClick={() => handleDelete(tab)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="block truncate text-xs text-foreground">{tab.name}</span>
                        </div>
                        <button
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                          onClick={() => handleRestore(tab)}
                          title="Restore tab"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                        <button
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                          onClick={() => setConfirmDeleteKey(key)}
                          title="Delete permanently"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
