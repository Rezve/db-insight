"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useTheme } from "next-themes";
import { useEditorFontSize } from "@/hooks/use-editor-font-size";
import dynamic from "next/dynamic";
import type { editor, languages, IRange } from "monaco-editor";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Play, Clock, BarChart2, GitBranch, GitCompare, Pin, PinOff, WandSparkles, X } from "lucide-react";
import { format as formatSql } from "sql-formatter";
import ResultsTable from "./ResultsTable";
import StatisticsPanel from "./StatisticsPanel";
import QueryPlanVisualizer from "./QueryPlanVisualizer";
import QueryPlanText from "./QueryPlanText";
import CompareView from "./CompareView";
import QueryPickerModal from "./QueryPickerModal";
import type { SchemaData } from "@/types/db";

// Monaco must not be SSR'd
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface QueryResult {
  columns: { name: string; dataType: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
  error?: string;
  lineNumber?: number;
  rowsAffected?: number[];
  statistics?: string[];
  planXml?: string;
}

interface SqlEditorProps {
  tabId: string;
  sql: string;
  onSqlChange: (sql: string) => void;
  result: QueryResult | null;
  resultSql: string | null;
  onResultChange: (result: QueryResult | null) => void;
  previousResult: QueryResult | null;
  previousSql: string | null;
  onRunComplete: (
    result: QueryResult,
    resultSql: string,
    previousResult: QueryResult | null,
    previousSql: string | null
  ) => void;
  baselinePinned: boolean;
  baselinePinnedAt: number | null;
  onPinBaselineChange: (pinned: boolean) => void;
  running: boolean;
  onRunningChange: (running: boolean) => void;
  statsEnabled: boolean;
  onStatsEnabledChange: (v: boolean) => void;
  planEnabled: boolean;
  onPlanEnabledChange: (v: boolean) => void;
  compareEnabled: boolean;
  onCompareEnabledChange: (v: boolean) => void;
  activeResultTab: string;
  onActiveResultTabChange: (tab: string) => void;
}

export default function SqlEditor({
  tabId,
  sql,
  onSqlChange,
  result,
  resultSql,
  onResultChange,
  previousResult,
  previousSql,
  onRunComplete,
  baselinePinned,
  baselinePinnedAt,
  onPinBaselineChange,
  running,
  onRunningChange,
  statsEnabled,
  onStatsEnabledChange,
  planEnabled,
  onPlanEnabledChange,
  compareEnabled,
  onCompareEnabledChange,
  activeResultTab,
  onActiveResultTabChange,
}: SqlEditorProps) {
  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const rem = ms % 1000;
    if (m > 0) return `${m}m ${s}s ${rem}ms`;
    return `${s}s ${rem}ms`;
  }

  const { resolvedTheme } = useTheme();
  const { fontSize: editorFontSize, setFontSize, min: minFontSize, max: maxFontSize } = useEditorFontSize();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const schemaRef = useRef<SchemaData | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);
  const prevTabId = useRef(tabId);
  const [hasSelection, setHasSelection] = useState(false);
  const [editorHeightPx, setEditorHeightPx] = useState(260);
  const queryStartRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [queryPickerOpen, setQueryPickerOpen] = useState(false);
  const [queryPickerOptions, setQueryPickerOptions] = useState<string[]>([]);
  const [queryPickerDefaultIndex, setQueryPickerDefaultIndex] = useState(0);

  // Load schema for autocomplete once on mount
  useEffect(() => {
    fetch("/api/schema")
      .then((r) => r.json())
      .then((data: SchemaData) => {
        schemaRef.current = data;
      })
      .catch(() => {});
  }, []);

  // Sync Monaco content when switching tabs
  useEffect(() => {
    if (prevTabId.current !== tabId && editorRef.current) {
      editorRef.current.setValue(sql);
      prevTabId.current = tabId;
    }
  }, [tabId, sql]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (queryStartRef.current !== null) {
        setElapsedMs(Date.now() - queryStartRef.current);
      }
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  const registerCompletionProvider = useCallback(
    (monacoInstance: typeof import("monaco-editor")) => {
      monacoInstance.languages.registerCompletionItemProvider("sql", {
        triggerCharacters: [" ", ".", "("],
        provideCompletionItems: (model, position) => {
          const schema = schemaRef.current;
          if (!schema?.tables) return { suggestions: [] };

          const word = model.getWordUntilPosition(position);
          const range: IRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions: languages.CompletionItem[] = [];

          // SQL keywords
          const keywords = [
            "SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
            "OUTER JOIN", "ON", "GROUP BY", "ORDER BY", "HAVING", "INSERT INTO", "UPDATE",
            "DELETE FROM", "SET", "VALUES", "AS", "DISTINCT", "TOP", "WITH", "NOLOCK",
            "COUNT", "SUM", "AVG", "MIN", "MAX", "CAST", "CONVERT", "ISNULL", "COALESCE",
            "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN", "IS NULL", "IS NOT NULL",
          ];
          for (const kw of keywords) {
            suggestions.push({
              label: kw,
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              insertText: kw,
              range,
            });
          }

          // Tables
          for (const table of schema.tables) {
            suggestions.push({
              label: table.name,
              kind: monacoInstance.languages.CompletionItemKind.Class,
              insertText: `[${table.schema}].[${table.name}]`,
              detail: `Table · schema: ${table.schema}`,
              documentation: `${table.columns.length} columns`,
              range,
            });
            // Columns for each table
            for (const col of table.columns) {
              suggestions.push({
                label: `${table.name}.${col.name}`,
                kind: monacoInstance.languages.CompletionItemKind.Field,
                insertText: `[${col.name}]`,
                detail: `${col.dataType} | ${table.name}`,
                range,
              });
            }
          }

          // Stored procedures
          for (const sp of schema.storedProcedures) {
            suggestions.push({
              label: sp.name,
              kind: monacoInstance.languages.CompletionItemKind.Module,
              insertText: `[${sp.schema}].[${sp.name}]`,
              detail: "Stored Procedure",
              range,
            });
          }

          return { suggestions };
        },
      });
    },
    []
  );

  function handleEditorDidMount(
    editorInstance: editor.IStandaloneCodeEditor,
    monacoInstance: typeof import("monaco-editor")
  ) {
    editorRef.current = editorInstance;
    monacoRef.current = monacoInstance;
    registerCompletionProvider(monacoInstance);

    // Track whether the user has an active text selection
    editorInstance.onDidChangeCursorSelection((e) => {
      const sel = e.selection;
      setHasSelection(
        !(sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn)
      );
    });

    // Ctrl+Enter to run (selected text if any, otherwise full query)
    editorInstance.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
      () => runQuery()
    );

    // Alt+Shift+F to format
    editorInstance.addCommand(
      monacoInstance.KeyMod.Alt | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyF,
      () => formatQuery()
    );

    // Ctrl+Wheel to zoom font size
    const domNode = editorInstance.getDomNode();
    if (domNode) {
      domNode.addEventListener(
        "wheel",
        (e: WheelEvent) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          const current = editorInstance.getOption(monacoInstance.editor.EditorOption.fontSize);
          const next = Math.min(maxFontSize, Math.max(minFontSize, current + (e.deltaY < 0 ? 1 : -1)));
          editorInstance.updateOptions({ fontSize: next });
          setFontSize(next);
        },
        { passive: false }
      );
    }
  }

  function formatQuery() {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;

    const model = editorInstance.getModel();
    const sel = editorInstance.getSelection();
    const hasActiveSelection = sel && model && !sel.isEmpty();

    const rawSql = hasActiveSelection
      ? model!.getValueInRange(sel!)
      : editorInstance.getValue();

    if (!rawSql.trim()) {
      toast.warning("Nothing to format");
      return;
    }

    let formatted: string;
    try {
      formatted = formatSql(rawSql, {
        language: "tsql",
        tabWidth: 2,
        keywordCase: "upper",
        expressionWidth: 100,
        logicalOperatorNewline: "before",
        newlineBeforeSemicolon: false,
        linesBetweenQueries: 2,
      });
    } catch {
      toast.error("Could not format the query");
      return;
    }

    editorInstance.pushUndoStop();
    if (hasActiveSelection) {
      editorInstance.executeEdits("format", [{ range: sel!, text: formatted }]);
    } else {
      const fullRange = model!.getFullModelRange();
      editorInstance.executeEdits("format", [{ range: fullRange, text: formatted }]);
      onSqlChange(formatted);
    }
    editorInstance.pushUndoStop();
    toast.success(hasActiveSelection ? "Selection formatted" : "Query formatted");
  }

  function splitSqlQueries(text: string): { text: string; startLine: number }[] {
    // Split on GO batch separator first (T-SQL specific)
    const goPattern = /^\s*GO\s*$/im;
    if (goPattern.test(text)) {
      const results: { text: string; startLine: number }[] = [];
      const globalGo = /^\s*GO\s*$/gim;
      let lastEnd = 0;
      let lineOffset = 1;
      let match: RegExpExecArray | null;
      while ((match = globalGo.exec(text)) !== null) {
        const segment = text.slice(lastEnd, match.index).trim();
        if (segment) results.push({ text: segment, startLine: lineOffset });
        const consumed = text.slice(lastEnd, match.index + match[0].length);
        lineOffset += (consumed.match(/\n/g) ?? []).length;
        lastEnd = match.index + match[0].length;
      }
      const tail = text.slice(lastEnd).trim();
      if (tail) results.push({ text: tail, startLine: lineOffset });
      if (results.length > 1) return results;
    }

    // Split on semicolons, skipping those inside single-quoted strings and block comments
    const statements: { text: string; startLine: number }[] = [];
    let current = "";
    let inString = false;
    let inBlockComment = false;
    let currentLine = 1;
    let segmentStartLine = 1;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === "\n") currentLine++;

      if (!inString && !inBlockComment && ch === "'") { inString = true; current += ch; continue; }
      if (inString && ch === "'" && next === "'") { current += "''"; i++; continue; }
      if (inString && ch === "'") { inString = false; current += ch; continue; }
      if (!inString && !inBlockComment && ch === "/" && next === "*") { inBlockComment = true; current += "/*"; i++; continue; }
      if (inBlockComment && ch === "*" && next === "/") { inBlockComment = false; current += "*/"; i++; continue; }

      if (!inString && !inBlockComment && ch === ";") {
        const trimmed = current.trim();
        if (trimmed) statements.push({ text: trimmed, startLine: segmentStartLine });
        current = "";
        segmentStartLine = currentLine + 1;
      } else {
        current += ch;
      }
    }
    const remaining = current.trim();
    if (remaining) statements.push({ text: remaining, startLine: segmentStartLine });
    return statements;
  }

  async function runQuery(queryText?: string) {
    let rawSql: string;
    let hasUserSelection = false;
    if (queryText !== undefined) {
      rawSql = queryText;
    } else {
      const editorInstance = editorRef.current;
      if (editorInstance) {
        const sel = editorInstance.getSelection();
        const model = editorInstance.getModel();
        if (sel && model && !sel.isEmpty()) {
          rawSql = model.getValueInRange(sel);
          hasUserSelection = true;
        } else {
          rawSql = editorInstance.getValue();
        }
      } else {
        rawSql = sql;
      }
    }
    if (!rawSql.trim()) {
      toast.warning("Enter a SQL query first");
      return;
    }

    // Show picker when there are multiple queries and the user hasn't selected text or a specific query
    if (!hasUserSelection && queryText === undefined) {
      const queries = splitSqlQueries(rawSql);
      if (queries.length > 1) {
        const cursorLine = editorRef.current?.getPosition()?.lineNumber ?? 1;
        let defaultIndex = 0;
        for (let i = queries.length - 1; i >= 0; i--) {
          if (queries[i].startLine <= cursorLine) { defaultIndex = i; break; }
        }
        setQueryPickerOptions(queries.map(q => q.text));
        setQueryPickerDefaultIndex(defaultIndex);
        setQueryPickerOpen(true);
        return;
      }
    }

    // Build SQL with optional wrappers (stats and/or plan)
    const prefixParts: string[] = [];
    const suffixParts: string[] = [];
    if (statsEnabled) {
      prefixParts.push("SET STATISTICS IO ON;", "SET STATISTICS TIME ON;");
      suffixParts.unshift("SET STATISTICS IO OFF;", "SET STATISTICS TIME OFF;");
    }
    if (planEnabled) {
      prefixParts.push("SET STATISTICS XML ON;");
      suffixParts.unshift("SET STATISTICS XML OFF;");
    }
    const sqlText =
      prefixParts.length > 0
        ? `${prefixParts.join("\n")}\n${rawSql}\n${suffixParts.join("\n")}`
        : rawSql;

    const controller = new AbortController();
    abortRef.current = controller;
    queryStartRef.current = Date.now();
    setElapsedMs(0);
    onRunningChange(true);
    onResultChange(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlText, planEnabled }),
        signal: controller.signal,
      });
      const data = await res.json();

      if (res.ok) {
        // Baseline selection for the compare diff:
        // - Pin active → keep the pinned baseline untouched.
        // - Compare on, no pin → auto-roll (promote prior successful result).
        // - Compare off → no baseline.
        let nextPrev: QueryResult | null = null;
        let nextPrevSql: string | null = null;
        if (compareEnabled) {
          if (baselinePinned && previousResult) {
            nextPrev = previousResult;
            nextPrevSql = previousSql;
          } else if (result && !result.error) {
            nextPrev = result;
            nextPrevSql = resultSql;
          }
        }
        onRunComplete(data, rawSql, nextPrev, nextPrevSql);
        if (data.truncated) {
          toast.info(`Results truncated to 1,000 rows (total: ${data.rowCount})`);
        }
        if (compareEnabled && nextPrev) {
          onActiveResultTabChange("compare");
        } else if (data.planXml) {
          onActiveResultTabChange("visualPlan");
        } else if (data.statistics?.length) {
          onActiveResultTabChange("statistics");
        } else {
          onActiveResultTabChange("results");
        }
      } else {
        onResultChange({ ...data, columns: [], rows: [], rowCount: 0, durationMs: 0, truncated: false });
        toast.error(data.error ?? "Query failed");
        onActiveResultTabChange(data.statistics?.length ? "statistics" : "results");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled — no toast needed
      } else {
        toast.error("Network error");
      }
    } finally {
      queryStartRef.current = null;
      abortRef.current = null;
      onRunningChange(false);
    }
  }

  function cancelQuery() {
    abortRef.current?.abort();
  }

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startHeight: editorHeightPx };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current || !containerRef.current) return;
      const containerH = containerRef.current.clientHeight;
      const delta = ev.clientY - dragState.current.startY;
      const next = dragState.current.startHeight + delta;
      // Clamp: editor min 80px, leave at least 120px for results panel
      const min = 80;
      const max = containerH - 120;
      setEditorHeightPx(Math.max(min, Math.min(max, next)));
    };

    const onUp = () => {
      dragState.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, [editorHeightPx]);

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-1 border-b bg-zinc-50 dark:bg-zinc-900">
        {running ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={cancelQuery}
            className="h-7 w-7 p-0"
            title="Cancel query"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => runQuery()}
            className="h-7 w-7 p-0"
            title={hasSelection ? "Run selected text (Ctrl+Enter)" : "Run query (Ctrl+Enter)"}
          >
            <Play className="h-4 w-4 text-green-500" />
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={formatQuery}
          className="h-7 w-7 p-0"
          title="Format SQL (Alt+Shift+F)"
        >
          <WandSparkles className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-2 h-4 w-px bg-border" />
        <Button
          size="sm"
          variant={statsEnabled ? "default" : "outline"}
          onClick={() => onStatsEnabledChange(!statsEnabled)}
          className="h-7 w-7 p-0"
          title={statsEnabled ? "Statistics IO/TIME ON — click to disable" : "Enable Statistics IO/TIME for every query"}
        >
          <BarChart2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant={planEnabled ? "default" : "outline"}
          onClick={() => onPlanEnabledChange(!planEnabled)}
          className="h-7 w-7 p-0"
          title={planEnabled ? "Query Plan ON — click to disable" : "Enable execution plan capture"}
        >
          <GitBranch className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant={compareEnabled ? "default" : "outline"}
          onClick={() => {
            const next = !compareEnabled;
            onCompareEnabledChange(next);
            if (next && !statsEnabled && !planEnabled) {
              toast.info("Tip: enable Statistics and Query Plan for richer comparisons.");
            }
          }}
          className="h-7 w-7 p-0"
          title={
            compareEnabled
              ? "Compare ON — diffs last two runs. Click to disable."
              : "Compare last two runs — tracks deltas in statistics and plan."
          }
        >
          <GitCompare className="h-3.5 w-3.5" />
        </Button>
        {compareEnabled && (
          <Button
            size="sm"
            variant={baselinePinned ? "default" : "outline"}
            disabled={!baselinePinned && (!result || !!result.error)}
            onClick={() => {
              if (baselinePinned) {
                onPinBaselineChange(false);
                toast.info("Baseline unpinned.");
              } else {
                if (!result || result.error) return;
                onPinBaselineChange(true);
                toast.success("Baseline pinned — future runs will compare against this query.");
              }
            }}
            className="h-7 w-7 p-0"
            title={
              baselinePinned
                ? "Baseline pinned — click to unpin and resume auto-rolling compare."
                : !result || result.error
                ? "Run a query first to pin it as baseline."
                : "Pin this run as the sticky baseline for future compare diffs."
            }
          >
            {baselinePinned ? (
              <PinOff className="h-3.5 w-3.5" />
            ) : (
              <Pin className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
        <div className="flex-1" />
        {(running || (result && !result.error)) && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span className="tabular-nums inline-block min-w-[7rem]">
              {running
                ? formatDuration(elapsedMs)
                : `${formatDuration(result!.durationMs)} · ${result!.rowCount} rows`}
            </span>
          </span>
        )}
      </div>

      {/* Editor */}
      <div style={{ height: editorHeightPx, minHeight: 80, flexShrink: 0 }}>
        <MonacoEditor
          defaultLanguage="sql"
          defaultValue={sql}
          onChange={(v) => onSqlChange(v ?? "")}
          onMount={handleEditorDidMount}
          theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
          options={{
            minimap: { enabled: false },
            fontSize: editorFontSize,
            fontFamily: "var(--font-geist-mono), 'Cascadia Code', 'Fira Code', monospace",
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            tabSize: 2,
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
          }}
        />
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className="group relative flex items-center justify-center shrink-0 border-t border-b"
        style={{ height: 8, cursor: "row-resize" }}
        title="Drag to resize panels"
      >
        <div className="w-12 h-1 rounded-full bg-border group-hover:bg-zinc-400 dark:group-hover:bg-zinc-500 transition-colors" />
      </div>

      {/* Results / Statistics Tabs */}
      <Tabs value={activeResultTab} onValueChange={onActiveResultTabChange} className="flex flex-col min-h-0" style={{ flex: "1 1 0", overflow: "hidden" }}>
        <TabsList className="mx-3 mt-2 mb-1 w-fit h-8 shrink-0">
          <TabsTrigger value="results" className="text-xs px-3 h-6">Results</TabsTrigger>
          <TabsTrigger value="statistics" className="text-xs px-3 h-6 gap-1.5">
            Statistics
            {result?.statistics?.length ? (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 min-w-4">
                {result.statistics.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="visualPlan" className="text-xs px-3 h-6 gap-1.5">
            Visual Plan
            {result?.planXml ? (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 min-w-4">
                <GitBranch className="h-2.5 w-2.5" />
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="planText" className="text-xs px-3 h-6">
            Plan Text
          </TabsTrigger>
          {compareEnabled && (
            <TabsTrigger value="compare" className="text-xs px-3 h-6 gap-1.5">
              Compare
              {previousResult ? (
                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 min-w-4">
                  <GitCompare className="h-2.5 w-2.5" />
                </Badge>
              ) : null}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="results" className="flex-1 overflow-auto min-h-0 mt-0 data-[state=inactive]:hidden">
          <ResultsTable result={result} loading={running} />
        </TabsContent>
        <TabsContent value="statistics" className="flex-1 overflow-auto min-h-0 mt-0 data-[state=inactive]:hidden">
          <StatisticsPanel
            messages={result?.statistics ?? []}
            onEnable={statsEnabled ? undefined : () => onStatsEnabledChange(true)}
          />
        </TabsContent>
        <TabsContent value="visualPlan" className="flex-1 overflow-hidden min-h-0 mt-0 data-[state=inactive]:hidden">
          <QueryPlanVisualizer planXml={result?.planXml} />
        </TabsContent>
        <TabsContent value="planText" className="flex-1 overflow-hidden min-h-0 mt-0 data-[state=inactive]:hidden">
          <QueryPlanText planXml={result?.planXml} />
        </TabsContent>
        {compareEnabled && (
          <TabsContent value="compare" className="flex-1 overflow-auto min-h-0 mt-0 data-[state=inactive]:hidden">
            <CompareView
              current={result}
              previous={previousResult}
              previousSql={previousSql}
              baselinePinned={baselinePinned}
              baselinePinnedAt={baselinePinnedAt}
              onUnpin={() => {
                onPinBaselineChange(false);
                toast.info("Baseline unpinned.");
              }}
            />
          </TabsContent>
        )}
      </Tabs>

      <QueryPickerModal
        open={queryPickerOpen}
        queries={queryPickerOptions}
        defaultIndex={queryPickerDefaultIndex}
        onSelect={(query) => runQuery(query)}
        onClose={() => setQueryPickerOpen(false)}
      />
    </div>
  );
}
