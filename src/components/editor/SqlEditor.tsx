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
import type { SchemaData, SchemaTable, SchemaRoutine, ColumnInfo } from "@/types/db";
import {
  buildSchemaIndex,
  analyzeQueryAt,
  collectDiagnostics,
  resolveQualifier,
  type SchemaIndex,
} from "@/lib/sql-intellisense";

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
  const schemaIndexRef = useRef<SchemaIndex | null>(null);
  const providersRegisteredRef = useRef(false);
  const diagTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        schemaIndexRef.current = buildSchemaIndex(data);
        runDiagnostics();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runDiagnostics = useCallback(() => {
    const editorInstance = editorRef.current;
    const monacoInstance = monacoRef.current;
    const index = schemaIndexRef.current;
    if (!editorInstance || !monacoInstance) return;
    const model = editorInstance.getModel();
    if (!model) return;
    if (!index) {
      monacoInstance.editor.setModelMarkers(model, "sql-intellisense", []);
      return;
    }
    const text = model.getValue();
    const diags = collectDiagnostics(text, index);
    const markers = diags.map((d) => {
      const startPos = model.getPositionAt(d.start);
      const endPos = model.getPositionAt(d.end);
      return {
        severity: monacoInstance.MarkerSeverity.Error,
        message: d.message,
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
        source: "sql-intellisense",
      };
    });
    monacoInstance.editor.setModelMarkers(model, "sql-intellisense", markers);
  }, []);

  const scheduleDiagnostics = useCallback(() => {
    if (diagTimerRef.current) clearTimeout(diagTimerRef.current);
    diagTimerRef.current = setTimeout(runDiagnostics, 250);
  }, [runDiagnostics]);

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

  const registerProviders = useCallback(
    (monacoInstance: typeof import("monaco-editor")) => {
      if (providersRegisteredRef.current) return;
      providersRegisteredRef.current = true;

      const TOP_LEVEL_KEYWORDS = [
        "SELECT", "INSERT", "UPDATE", "DELETE", "EXEC", "EXECUTE", "WITH",
        "DECLARE", "IF", "BEGIN", "CREATE", "ALTER", "DROP", "USE", "TRUNCATE",
      ];
      const CLAUSE_KEYWORDS = [
        "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN", "IS NULL", "IS NOT NULL",
        "CASE", "WHEN", "THEN", "ELSE", "END", "CAST", "CONVERT", "ISNULL",
        "COALESCE", "COUNT", "SUM", "AVG", "MIN", "MAX", "DISTINCT",
      ];

      monacoInstance.languages.registerCompletionItemProvider("sql", {
        triggerCharacters: [" ", ".", "(", ","],
        provideCompletionItems: (model, position) => {
          const index = schemaIndexRef.current;
          if (!index) return { suggestions: [] };

          const offset = model.getOffsetAt(position);
          const text = model.getValue();
          const ctx = analyzeQueryAt(text, offset, index);

          const word = model.getWordUntilPosition(position);
          const range: IRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const Kind = monacoInstance.languages.CompletionItemKind;
          const snippetRules = monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet;
          const suggestions: languages.CompletionItem[] = [];

          const pushColumn = (col: ColumnInfo, table: SchemaTable, prefix = "", sortBoost = "00") => {
            const nullable = col.isNullable ? "NULL" : "NOT NULL";
            const fk = col.foreignKey
              ? ` · FK → ${col.foreignKey.targetSchema}.${col.foreignKey.targetTable}.${col.foreignKey.targetColumn}`
              : "";
            suggestions.push({
              label: prefix ? `${prefix}${col.name}` : col.name,
              kind: Kind.Field,
              insertText: `[${col.name}]`,
              detail: `${col.dataType}${col.maxLength ? `(${col.maxLength})` : ""} · ${nullable}${fk} · ${table.schema}.${table.name}`,
              filterText: (prefix + col.name).toLowerCase(),
              sortText: `${sortBoost}${col.name}`,
              range,
            });
          };

          const pushTable = (table: SchemaTable, sortBoost = "10") => {
            suggestions.push({
              label: `${table.schema}.${table.name}`,
              kind: Kind.Class,
              insertText: `[${table.schema}].[${table.name}]`,
              detail: `Table · ${table.columns.length} columns`,
              filterText: `${table.schema}.${table.name} ${table.name}`.toLowerCase(),
              sortText: `${sortBoost}${table.name}`,
              range,
            });
          };

          const pushProcedure = (sp: SchemaRoutine, sortBoost = "10") => {
            suggestions.push({
              label: `${sp.schema}.${sp.name}`,
              kind: Kind.Module,
              insertText: `[${sp.schema}].[${sp.name}]`,
              detail: `Stored Procedure${sp.parameters?.length ? ` · ${sp.parameters.length} params` : ""}`,
              filterText: `${sp.schema}.${sp.name} ${sp.name}`.toLowerCase(),
              sortText: `${sortBoost}${sp.name}`,
              range,
            });
          };

          const pushKeyword = (kw: string, sortBoost = "50") => {
            suggestions.push({
              label: kw,
              kind: Kind.Keyword,
              insertText: kw,
              sortText: `${sortBoost}${kw}`,
              range,
            });
          };

          // Dot-qualified context: show only what's relevant.
          if (ctx.dotQualifier) {
            const res = resolveQualifier(ctx.dotQualifier, ctx.fromTables, index);
            if (res?.kind === "table") {
              for (const col of res.table.columns) pushColumn(col, res.table);
              return { suggestions };
            }
            if (res?.kind === "schema") {
              for (const t of index.allTables) {
                if (t.schema.toLowerCase() === res.schema) pushTable(t, "00");
              }
              return { suggestions };
            }
            return { suggestions: [] };
          }

          switch (ctx.clause) {
            case "from":
            case "join":
            case "update":
            case "into":
              for (const t of index.allTables) pushTable(t);
              // FK-aware JOIN snippets
              if (ctx.clause === "join" && ctx.fromTables.length > 0) {
                for (const ft of ctx.fromTables) {
                  if (!ft.known) continue;
                  const sourceAlias = ft.alias ?? ft.table.name;
                  for (const col of ft.table.columns) {
                    if (!col.foreignKey) continue;
                    const fk = col.foreignKey;
                    const targetAlias = fk.targetTable[0]?.toLowerCase() ?? "t";
                    const label = `JOIN ${fk.targetSchema}.${fk.targetTable} ${targetAlias} ON ${targetAlias}.${fk.targetColumn} = ${sourceAlias}.${col.name}`;
                    suggestions.push({
                      label,
                      kind: Kind.Snippet,
                      insertText:
                        `[${fk.targetSchema}].[${fk.targetTable}] \${1:${targetAlias}} ON \${1:${targetAlias}}.[${fk.targetColumn}] = ${sourceAlias}.[${col.name}]`,
                      insertTextRules: snippetRules,
                      detail: `Foreign key join from ${ft.table.schema}.${ft.table.name}.${col.name}`,
                      filterText: `join ${fk.targetTable}`.toLowerCase(),
                      sortText: `00${label}`,
                      range,
                    });
                  }
                }
              }
              break;
            case "exec":
              for (const sp of index.allProcedures) pushProcedure(sp);
              break;
            case "select":
            case "where":
            case "on":
            case "groupby":
            case "orderby":
            case "having":
            case "set": {
              // In-scope columns first.
              const ambiguous = new Map<string, number>();
              for (const ft of ctx.fromTables) {
                if (!ft.known) continue;
                for (const c of ft.table.columns) {
                  const key = c.name.toLowerCase();
                  ambiguous.set(key, (ambiguous.get(key) ?? 0) + 1);
                }
              }
              for (const ft of ctx.fromTables) {
                if (!ft.known) continue;
                const qualifier = ft.alias ?? ft.table.name;
                for (const c of ft.table.columns) {
                  const prefix = (ambiguous.get(c.name.toLowerCase()) ?? 0) > 1 ? `${qualifier}.` : "";
                  pushColumn(c, ft.table, prefix, "00");
                }
              }
              // Aliases themselves as completions (for `o.` typing pattern).
              for (const ft of ctx.fromTables) {
                if (!ft.known || !ft.alias) continue;
                suggestions.push({
                  label: ft.alias,
                  kind: Kind.Variable,
                  insertText: ft.alias,
                  detail: `Alias of ${ft.table.schema}.${ft.table.name}`,
                  sortText: `01${ft.alias}`,
                  range,
                });
              }
              for (const kw of CLAUSE_KEYWORDS) pushKeyword(kw, "50");
              break;
            }
            default: {
              for (const kw of TOP_LEVEL_KEYWORDS) pushKeyword(kw, "10");
              break;
            }
          }

          return { suggestions };
        },
      });

      monacoInstance.languages.registerSignatureHelpProvider("sql", {
        signatureHelpTriggerCharacters: ["(", ","],
        signatureHelpRetriggerCharacters: [","],
        provideSignatureHelp: (model, position) => {
          const index = schemaIndexRef.current;
          if (!index) return null;
          const offset = model.getOffsetAt(position);
          const ctx = analyzeQueryAt(model.getValue(), offset, index);
          if (!ctx.execProcedureKey) return null;
          const sp = index.proceduresByKey.get(ctx.execProcedureKey);
          if (!sp || !sp.parameters || sp.parameters.length === 0) return null;

          const paramLabels = sp.parameters.map((p) => {
            const len = p.maxLength && p.maxLength > 0 ? `(${p.maxLength})` : "";
            const out = p.isOutput ? " OUTPUT" : "";
            const def = p.hasDefault ? " = default" : "";
            return `${p.name} ${p.dataType}${len}${out}${def}`;
          });
          const label = `${sp.schema}.${sp.name}(${paramLabels.join(", ")})`;

          return {
            value: {
              signatures: [
                {
                  label,
                  parameters: paramLabels.map((p) => ({ label: p })),
                },
              ],
              activeSignature: 0,
              activeParameter: Math.min(ctx.execArgIndex ?? 0, sp.parameters.length - 1),
            },
            dispose: () => {},
          };
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
    registerProviders(monacoInstance);

    // Debounced diagnostics on every content change.
    const model = editorInstance.getModel();
    if (model) {
      model.onDidChangeContent(scheduleDiagnostics);
      runDiagnostics();
    }

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
            variant="ghost"
            onClick={cancelQuery}
            className="h-7 w-7 p-0 hover:ring-1 hover:ring-border"
            title="Cancel query"
          >
            <X className="h-4 w-4 text-destructive" />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => runQuery()}
            className="h-7 w-7 p-0 hover:ring-1 hover:ring-border"
            title={hasSelection ? "Run selected text (Ctrl+Enter)" : "Run query (Ctrl+Enter)"}
          >
            <Play className="h-4 w-4 text-green-500" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={formatQuery}
          className="h-7 w-7 p-0 hover:ring-1 hover:ring-border"
          title="Format SQL (Alt+Shift+F)"
        >
          <WandSparkles className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-2 h-4 w-px bg-border" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onStatsEnabledChange(!statsEnabled)}
          className={`h-7 w-7 p-0 hover:ring-1 hover:ring-border ${statsEnabled ? "bg-accent text-accent-foreground" : ""}`}
          title={statsEnabled ? "Statistics IO/TIME ON — click to disable" : "Enable Statistics IO/TIME for every query"}
        >
          <BarChart2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPlanEnabledChange(!planEnabled)}
          className={`h-7 w-7 p-0 hover:ring-1 hover:ring-border ${planEnabled ? "bg-accent text-accent-foreground" : ""}`}
          title={planEnabled ? "Query Plan ON — click to disable" : "Enable execution plan capture"}
        >
          <GitBranch className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const next = !compareEnabled;
            onCompareEnabledChange(next);
            if (next && !statsEnabled && !planEnabled) {
              toast.info("Tip: enable Statistics and Query Plan for richer comparisons.");
            }
          }}
          className={`h-7 w-7 p-0 hover:ring-1 hover:ring-border ${compareEnabled ? "bg-accent text-accent-foreground" : ""}`}
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
            variant="ghost"
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
            className={`h-7 w-7 p-0 hover:ring-1 hover:ring-border ${baselinePinned ? "bg-accent text-accent-foreground" : ""}`}
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
