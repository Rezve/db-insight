"use client";

import { useEffect, useState } from "react";
import { useSessionCacheContext } from "@/contexts/session-cache-context";

export function useCachedFetch<T>(
  cacheKey: string,
  url: string,
  enabled: boolean
): { data: T | null; loading: boolean; error: string | null } {
  const { cache, refreshCount } = useSessionCacheContext();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (enabled) {
      const hit = cache.current.get(cacheKey) as T | undefined;
      if (hit !== undefined) {
        setData(hit);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          return;
        }
        if (enabled) cache.current.set(cacheKey, json);
        setData(json);
      })
      .catch(() => setError("Failed to fetch"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, url, enabled, refreshCount]);

  return { data, loading, error };
}
