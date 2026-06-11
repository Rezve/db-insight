"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { buildSchemaIndex, type SchemaIndex } from "@/lib/sql-intellisense";
import type { SchemaData } from "@/types/db";

interface SchemaContextValue {
  schemaData: SchemaData | null;
  schemaIndex: SchemaIndex | null;
}

const SchemaContext = createContext<SchemaContextValue>({ schemaData: null, schemaIndex: null });

export function SchemaProvider({ children }: { children: React.ReactNode }) {
  const [schemaData, setSchemaData] = useState<SchemaData | null>(null);
  const schemaIndexRef = useRef<SchemaIndex | null>(null);
  const [schemaIndex, setSchemaIndex] = useState<SchemaIndex | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch("/api/schema")
      .then((r) => r.json())
      .then((data: SchemaData) => {
        const index = buildSchemaIndex(data);
        schemaIndexRef.current = index;
        setSchemaData(data);
        setSchemaIndex(index);
      })
      .catch(() => {});
  }, []);

  return (
    <SchemaContext.Provider value={{ schemaData, schemaIndex }}>
      {children}
    </SchemaContext.Provider>
  );
}

export function useSchemaContext() {
  return useContext(SchemaContext);
}
