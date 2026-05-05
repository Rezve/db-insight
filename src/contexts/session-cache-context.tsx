"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSessionCache } from "@/hooks/use-session-cache";

interface SessionCacheContextValue {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  cache: React.MutableRefObject<Map<string, unknown>>;
  refreshCount: number;
  invalidate: () => void;
}

const SessionCacheContext = createContext<SessionCacheContextValue | null>(null);

export function SessionCacheProvider({ children }: { children: React.ReactNode }) {
  const { enabled, setEnabled } = useSessionCache();
  const cache = useRef<Map<string, unknown>>(new Map());
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      cache.current.clear();
    }
  }, [enabled]);

  function invalidate() {
    cache.current.clear();
    setRefreshCount((c) => c + 1);
  }

  return (
    <SessionCacheContext.Provider value={{ enabled, setEnabled, cache, refreshCount, invalidate }}>
      {children}
    </SessionCacheContext.Provider>
  );
}

export function useSessionCacheContext() {
  const ctx = useContext(SessionCacheContext);
  if (!ctx) throw new Error("useSessionCacheContext must be used within SessionCacheProvider");
  return ctx;
}
