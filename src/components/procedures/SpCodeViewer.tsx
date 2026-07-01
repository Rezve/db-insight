"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Copy, Check } from "lucide-react";
import type { editor } from "monaco-editor";
import { useEditorThemeContext } from "@/contexts/editor-theme-context";
import { ensureMonacoThemeLoaded } from "@/lib/editor-themes";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface SpCodeViewerProps {
  definition: string;
}

export default function SpCodeViewer({ definition }: SpCodeViewerProps) {
  const { monacoThemeId } = useEditorThemeContext();
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const monacoInstance = monacoRef.current;
    if (!monacoInstance) return;
    let cancelled = false;
    ensureMonacoThemeLoaded(monacoInstance, monacoThemeId).then(() => {
      if (!cancelled) monacoInstance.editor.setTheme(monacoThemeId);
    });
    return () => {
      cancelled = true;
    };
  }, [monacoThemeId]);

  function handleEditorDidMount(
    _editorInstance: editor.IStandaloneCodeEditor,
    monacoInstance: typeof import("monaco-editor")
  ) {
    monacoRef.current = monacoInstance;
    ensureMonacoThemeLoaded(monacoInstance, monacoThemeId).then(() => {
      monacoInstance.editor.setTheme(monacoThemeId);
    });
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(definition);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative h-full w-full">
      <button
        onClick={handleCopy}
        title="Copy to clipboard"
        className="absolute top-3 right-4 z-10 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-600 dark:text-zinc-300 transition-colors"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-green-500" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            Copy
          </>
        )}
      </button>
      <MonacoEditor
        height="100%"
        language="sql"
        value={definition}
        theme={monacoThemeId}
        onMount={handleEditorDidMount}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          lineNumbers: "on",
          folding: true,
          renderLineHighlight: "line",
        }}
      />
    </div>
  );
}
