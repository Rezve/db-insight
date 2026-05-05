"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "sessionCache";

export function useSessionCache() {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    setEnabledState(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  function setEnabled(value: boolean) {
    localStorage.setItem(STORAGE_KEY, String(value));
    setEnabledState(value);
  }

  return { enabled, setEnabled };
}
