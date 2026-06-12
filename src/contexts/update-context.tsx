"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

const STORAGE_KEY = "autoUpdateCheck";

interface UpdateContextValue {
  autoCheckEnabled: boolean;
  setAutoCheckEnabled: (enabled: boolean) => void;
  updateAvailable: boolean;
  commitsBehind: number;
  checking: boolean;
  lastChecked: Date | null;
  checkNow: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [autoCheckEnabled, setAutoCheckEnabledState] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [commitsBehind, setCommitsBehind] = useState(0);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const hasChecked = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setAutoCheckEnabledState(stored !== "false");
  }, []);

  function setAutoCheckEnabled(enabled: boolean) {
    setAutoCheckEnabledState(enabled);
    localStorage.setItem(STORAGE_KEY, String(enabled));
  }

  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/app-update/check");
      const data = await res.json();
      if (data.updateAvailable) {
        setCommitsBehind(data.commitsBehind);
        setUpdateAvailable(true);
      } else {
        setCommitsBehind(0);
        setUpdateAvailable(false);
      }
      setLastChecked(new Date());
    } catch {
      // silently ignore network errors
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (autoCheckEnabled && !hasChecked.current) {
      hasChecked.current = true;
      checkNow();
    }
  }, [autoCheckEnabled, checkNow]);

  return (
    <UpdateContext.Provider
      value={{
        autoCheckEnabled,
        setAutoCheckEnabled,
        updateAvailable,
        commitsBehind,
        checking,
        lastChecked,
        checkNow,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdateContext() {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdateContext must be used within UpdateProvider");
  return ctx;
}
