"use client";

import { useRef, useState, useEffect } from "react";
import { Plus, Upload, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import SqlEditor from "./SqlEditor";

interface QueryResult {
  columns: { name: string; dataType: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
  error?: string;
  lineNumber?: number;
  statistics?: string[];
  planXml?: string;
}

type ResultTabName = "results" | "statistics" | "visualPlan" | "planText" | "compare";

interface TabState {
  id: string;
  name: string;
  sql: string;
  result: QueryResult | null;
  resultSql: string | null;
  previousResult: QueryResult | null;
  previousSql: string | null;
  baselinePinned: boolean;
  baselinePinnedAt: number | null;
  running: boolean;
  activeResultTab: ResultTabName;
  statsEnabled: boolean;
  planEnabled: boolean;
  compareEnabled: boolean;
}

interface PersistedTab { id: string; name: string; sql: string; }
interface PersistedEditorState { tabs: PersistedTab[]; activeTabId: string; }

function nextQueryNumber(existingTabs: { name: string }[]): number {
  const used = new Set<number>();
  for (const t of existingTabs) {
    const m = /^Query (\d+)$/.exec(t.name);
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

function createTab(existingTabs: { name: string }[], name?: string, sql?: string): TabState {
  return {
    id: crypto.randomUUID(),
    name: name ?? `Query ${nextQueryNumber(existingTabs)}`,
    sql: sql ?? "SELECT TOP 100 * FROM ",
    result: null,
    resultSql: null,
    previousResult: null,
    previousSql: null,
    baselinePinned: false,
    baselinePinnedAt: null,
    running: false,
    activeResultTab: "results",
    statsEnabled: false,
    planEnabled: false,
    compareEnabled: false,
  };
}

export default function EditorTabsManager() {
  const [tabs, setTabs] = useState<TabState[]>(() => [createTab([])]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);
  const [loaded, setLoaded] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  // Load persisted tabs from SQLite on mount
  useEffect(() => {
    fetch("/api/editor-tabs")
      .then((r) => r.json())
      .then((data: PersistedEditorState) => {
        if (Array.isArray(data.tabs) && data.tabs.length > 0) {
          const restored: TabState[] = data.tabs.map((pt) => ({
            id: pt.id,
            name: pt.name,
            sql: pt.sql,
            result: null,
            resultSql: null,
            previousResult: null,
            previousSql: null,
            baselinePinned: false,
            baselinePinnedAt: null,
            running: false,
            activeResultTab: "results" as ResultTabName,
            statsEnabled: false,
            planEnabled: false,
            compareEnabled: false,
          }));
          setTabs(restored);
          const valid = restored.some((t) => t.id === data.activeTabId);
          setActiveTabId(valid ? data.activeTabId : restored[0].id);
        }
      })
      .catch(() => { /* server unavailable — keep the initial tab */ })
      .finally(() => setLoaded(true));
  }, []);

  // Save tab state to SQLite on every change (debounced 500ms)
  useEffect(() => {
    if (!loaded) return;
    const state: PersistedEditorState = {
      tabs: tabs.map((t) => ({ id: t.id, name: t.name, sql: t.sql })),
      activeTabId,
    };
    const timer = setTimeout(() => {
      fetch("/api/editor-tabs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [tabs, activeTabId, loaded]);

  function updateTab(id: string, updates: Partial<TabState>) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }

  function addTab(name?: string, sql?: string) {
    const newTab = createTab(tabs, name, sql);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }

  function closeTab(id: string) {
    if (tabs.length === 1) return;
    const idx = tabs.findIndex((t) => t.id === id);
    const nextTab = tabs[idx - 1] ?? tabs[idx + 1];
    setTabs((prev) => prev.filter((t) => t.id !== id));
    if (activeTabId === id) {
      setActiveTabId(nextTab.id);
    }
  }

  function startRename(tab: TabState) {
    setRenamingId(tab.id);
    setRenameValue(tab.name);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      updateTab(renamingId, { name: renameValue.trim() });
    }
    setRenamingId(null);
  }

  function saveAsFile(tab: TabState) {
    const blob = new Blob([tab.sql], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tab.name}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".sql,.txt";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = (e.target?.result as string) ?? "";
        const name = file.name.replace(/\.(sql|txt)$/i, "");
        addTab(name, content);
      };
      reader.readAsText(file);
    };
    input.click();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div className="flex items-center border-b bg-zinc-50 dark:bg-zinc-900 shrink-0 overflow-x-auto">
        <div className="flex items-end min-w-0 flex-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isRenaming = renamingId === tab.id;
            return (
              <div
                key={tab.id}
                className={`group relative flex items-center gap-1 px-3 py-1.5 border-r text-xs cursor-pointer shrink-0 select-none transition-colors
                  ${isActive
                    ? "bg-background border-t-2 border-t-primary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                onClick={() => {
                  if (!isRenaming) setActiveTabId(tab.id);
                }}
                onDoubleClick={() => startRename(tab)}
                title={isActive ? "Double-click to rename" : tab.name}
              >
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    className="w-24 px-0.5 bg-transparent border-b border-primary outline-none text-xs text-foreground"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span className="max-w-[120px] truncate">{tab.name}</span>
                )}

                {/* Close button */}
                {tabs.length > 1 && (
                  <button
                    className={`ml-0.5 rounded p-0.5 transition-opacity hover:bg-zinc-200 dark:hover:bg-zinc-700
                      ${isActive ? "opacity-50 hover:opacity-100" : "opacity-0 group-hover:opacity-50 hover:!opacity-100"}`}
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    title="Close tab"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* New Tab button */}
          <button
            className="flex items-center justify-center w-7 h-7 mx-1 rounded text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
            onClick={() => addTab()}
            title="New tab"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Save / Import buttons — far right */}
        <div className="flex items-center gap-1 shrink-0 mr-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={() => saveAsFile(activeTab)}
            title={`Save "${activeTab.name}.sql"`}
          >
            <Download className="h-3.5 w-3.5" />
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={importFile}
            title="Import .sql file as new tab"
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
        </div>
      </div>

      {/* Editor — fills remaining space */}
      <div className="flex-1 overflow-hidden min-h-0">
        <SqlEditor
          tabId={activeTab.id}
          sql={activeTab.sql}
          onSqlChange={(sql) => updateTab(activeTab.id, { sql })}
          result={activeTab.result}
          resultSql={activeTab.resultSql}
          onResultChange={(result) => updateTab(activeTab.id, { result })}
          previousResult={activeTab.previousResult}
          previousSql={activeTab.previousSql}
          onRunComplete={(result, resultSql, previousResult, previousSql) =>
            updateTab(activeTab.id, { result, resultSql, previousResult, previousSql })
          }
          baselinePinned={activeTab.baselinePinned}
          baselinePinnedAt={activeTab.baselinePinnedAt}
          onPinBaselineChange={(pinned) => {
            if (pinned) {
              if (!activeTab.result || activeTab.result.error) return;
              updateTab(activeTab.id, {
                previousResult: activeTab.result,
                previousSql: activeTab.resultSql,
                baselinePinned: true,
                baselinePinnedAt: Date.now(),
              });
            } else {
              updateTab(activeTab.id, {
                baselinePinned: false,
                baselinePinnedAt: null,
              });
            }
          }}
          running={activeTab.running}
          onRunningChange={(running) => updateTab(activeTab.id, { running })}
          statsEnabled={activeTab.statsEnabled}
          onStatsEnabledChange={(statsEnabled) => updateTab(activeTab.id, { statsEnabled })}
          planEnabled={activeTab.planEnabled}
          onPlanEnabledChange={(planEnabled) => updateTab(activeTab.id, { planEnabled })}
          compareEnabled={activeTab.compareEnabled}
          onCompareEnabledChange={(compareEnabled) =>
            updateTab(activeTab.id, {
              compareEnabled,
              // Clear stale baseline + pin state when disabling compare.
              ...(compareEnabled
                ? {}
                : {
                    previousResult: null,
                    previousSql: null,
                    baselinePinned: false,
                    baselinePinnedAt: null,
                  }),
            })
          }
          activeResultTab={activeTab.activeResultTab}
          onActiveResultTabChange={(activeResultTab) => updateTab(activeTab.id, { activeResultTab: activeResultTab as ResultTabName })}
        />
      </div>
    </div>
  );
}
