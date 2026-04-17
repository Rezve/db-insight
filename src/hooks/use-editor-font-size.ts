"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "editor-font-size";
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 24;

function readFromStorage(): number {
  if (typeof window === "undefined") return DEFAULT_FONT_SIZE;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_FONT_SIZE;
  const parsed = parseInt(stored, 10);
  if (isNaN(parsed) || parsed < MIN_FONT_SIZE || parsed > MAX_FONT_SIZE) return DEFAULT_FONT_SIZE;
  return parsed;
}

export function useEditorFontSize() {
  const [fontSize, setFontSizeState] = useState<number>(DEFAULT_FONT_SIZE);

  useEffect(() => {
    setFontSizeState(readFromStorage());
  }, []);

  function setFontSize(size: number) {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
    localStorage.setItem(STORAGE_KEY, String(clamped));
    setFontSizeState(clamped);
  }

  return { fontSize, setFontSize, min: MIN_FONT_SIZE, max: MAX_FONT_SIZE };
}
