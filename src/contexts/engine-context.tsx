"use client";

import { createContext, useContext } from "react";
import type { DbEngine, DdlBuilders, DriverCapabilities } from "@/lib/db/types";
import { getDdl, getQuoteId, getPreviewQuery, type PreviewQuery } from "@/lib/db/ddl-registry";

interface EngineContextValue {
  engine: DbEngine;
  engineLabel: string;
  /** `dbo` / `public`; empty when the engine has no schema tier (MySQL). */
  defaultSchema: string;
  capabilities: DriverCapabilities;
  /** Dialect name understood by `sql-formatter`. */
  formatterDialect: "tsql" | "postgresql" | "mysql";
  ddl: DdlBuilders;
  quoteId: (name: string) => string;
  /** Row-limited preview of a table, in the engine's syntax. */
  previewQuery: PreviewQuery;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export interface EngineInfo {
  engine: DbEngine;
  engineLabel: string;
  defaultSchema: string;
  formatterDialect: "tsql" | "postgresql" | "mysql";
  capabilities: DriverCapabilities;
}

export function EngineProvider({
  info,
  children,
}: {
  info: EngineInfo;
  children: React.ReactNode;
}) {
  const value: EngineContextValue = {
    ...info,
    ddl: getDdl(info.engine),
    quoteId: getQuoteId(info.engine),
    previewQuery: getPreviewQuery(info.engine),
  };

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error("useEngine must be used within EngineProvider");
  return ctx;
}
