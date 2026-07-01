"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { EDITOR_THEMES, resolveMonacoThemeId, type EditorThemeOption } from "@/lib/editor-themes";

const STORAGE_KEY = "editor-color-theme";
const DEFAULT_THEME_ID = "auto";

interface EditorThemeContextValue {
  themeId: string;
  setThemeId: (id: string) => void;
  monacoThemeId: string;
  options: EditorThemeOption[];
}

const EditorThemeContext = createContext<EditorThemeContextValue | null>(null);

export function EditorThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [themeId, setThemeIdState] = useState(DEFAULT_THEME_ID);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setThemeIdState(stored);
  }, []);

  function setThemeId(id: string) {
    localStorage.setItem(STORAGE_KEY, id);
    setThemeIdState(id);
  }

  const monacoThemeId = resolveMonacoThemeId(themeId, resolvedTheme === "dark");

  return (
    <EditorThemeContext.Provider value={{ themeId, setThemeId, monacoThemeId, options: EDITOR_THEMES }}>
      {children}
    </EditorThemeContext.Provider>
  );
}

export function useEditorThemeContext() {
  const ctx = useContext(EditorThemeContext);
  if (!ctx) throw new Error("useEditorThemeContext must be used within EditorThemeProvider");
  return ctx;
}
