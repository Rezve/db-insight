"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import type { editor, languages, IRange } from "monaco-editor";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Play, Loader2, Trash2, Clock } from "lucide-react";
import ResultsTable from "./ResultsTable";
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
}

export default function SqlEditor() {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const schemaRef = useRef<SchemaData | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [sql, setSql] = useState("SELECT TOP 100 * FROM ");

  // Load schema for autocomplete once on mount
  useEffect(() => {
    fetch("/api/schema")
      .then((r) => r.json())
      .then((data: SchemaData) => {
        schemaRef.current = data;
      })
      .catch(() => {});
  }, []);

  const registerCompletionProvider = useCallback(
    (monacoInstance: typeof import("monaco-editor")) => {
      monacoInstance.languages.registerCompletionItemProvider("sql", {
        triggerCharacters: [" ", ".", "\n", "("],
        provideCompletionItems: (model, position) => {
          const schema = schemaRef.current;
          if (!schema) return { suggestions: [] };

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

    // Ctrl+Enter to run
    editorInstance.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
      () => runQuery(editorInstance.getValue())
    );
  }

  async function runQuery(queryText?: string) {
    const sqlText = queryText ?? editorRef.current?.getValue() ?? sql;
    if (!sqlText.trim()) {
      toast.warning("Enter a SQL query first");
      return;
    }

    setRunning(true);
    setResult(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlText }),
      });
      const data = await res.json();

      if (res.ok) {
        setResult(data);
        if (data.truncated) {
          toast.info(`Results truncated to 1,000 rows (total: ${data.rowCount})`);
        }
      } else {
        setResult({ ...data, columns: [], rows: [], rowCount: 0, durationMs: 0, truncated: false });
        toast.error(data.error ?? "Query failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-zinc-50 dark:bg-zinc-900">
        <Button
          size="sm"
          onClick={() => runQuery()}
          disabled={running}
          className="gap-1.5"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Run
        </Button>
        <span className="text-xs text-muted-foreground">or Ctrl+Enter</span>
        <div className="flex-1" />
        {result && !result.error && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {result.durationMs}ms · {result.rowCount} rows
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            editorRef.current?.setValue("");
            setSql("");
            setResult(null);
          }}
          title="Clear editor"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0" style={{ minHeight: "200px", maxHeight: "50vh" }}>
        <MonacoEditor
          defaultLanguage="sql"
          value={sql}
          onChange={(v) => setSql(v ?? "")}
          onMount={handleEditorDidMount}
          theme="vs"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
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

      {/* Results */}
      <div className="flex-1 overflow-auto border-t bg-background min-h-0">
        <ResultsTable result={result} loading={running} />
      </div>
    </div>
  );
}
