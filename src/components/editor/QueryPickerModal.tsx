"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface QueryPickerModalProps {
  open: boolean;
  queries: string[];
  defaultIndex: number;
  onSelect: (query: string) => void;
  onClose: () => void;
}

export default function QueryPickerModal({ open, queries, defaultIndex, onSelect, onClose }: QueryPickerModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const displayOrder = [
    defaultIndex,
    ...queries.map((_, i) => i).filter(i => i !== defaultIndex),
  ];

  // Reset to top (cursor item) each time the modal opens
  useEffect(() => {
    if (open) setSelectedIndex(0);
  }, [open, defaultIndex]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, queries.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onSelect(queries[displayOrder[selectedIndex]]);
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, onSelect, queries, selectedIndex, displayOrder]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background border rounded-lg shadow-xl w-[600px] max-w-[90vw] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <span className="text-sm font-medium">Select a query to run</span>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {displayOrder.map((origIdx, displayIdx) => {
            const query = queries[origIdx];
            const isSelected = displayIdx === selectedIndex;
            return (
              <button
                key={origIdx}
                ref={el => { itemRefs.current[displayIdx] = el; }}
                onClick={() => { onSelect(query); onClose(); }}
                onMouseEnter={() => setSelectedIndex(displayIdx)}
                className={[
                  "w-full text-left px-3 py-2 rounded-md border transition-colors",
                  isSelected
                    ? "bg-accent border-ring"
                    : "hover:bg-accent hover:border-accent-foreground/20",
                ].join(" ")}
              >
                <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-all line-clamp-3">
                  {query.length > 300 ? query.slice(0, 300) + "…" : query}
                </pre>
              </button>
            );
          })}
        </div>
        <div className="px-4 py-3 border-t shrink-0 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">↑↓ navigate · Enter to run</span>
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
