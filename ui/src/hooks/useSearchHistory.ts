import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_LIMIT = 20;

export type SearchHistoryItem = {
  id: string;
  query: string;
  normalized: string;
  count: number;
  updatedAt: number;
};

type UseSearchHistoryOptions = {
  storageKey: string;
  limit?: number;
  minLength?: number;
};

export function useSearchHistory(options: UseSearchHistoryOptions) {
  const { storageKey, limit = DEFAULT_LIMIT, minLength = 2 } = options;
  const [items, setItems] = useState<SearchHistoryItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setItems([]);
      } else {
        const parsed = JSON.parse(raw) as SearchHistoryItem[];
        if (Array.isArray(parsed)) {
          const sanitized = parsed
            .filter(
              (item) => typeof item?.query === "string" && item.query.trim(),
            )
            .slice(0, limit);
          setItems(sanitized);
        } else {
          setItems([]);
        }
      }
    } catch {
      setItems([]);
    } finally {
      setHydrated(true);
    }
  }, [storageKey, limit]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // ignore storage errors
    }
  }, [storageKey, items, hydrated]);

  const addQuery = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < minLength) return;
      const normalized = trimmed.toLowerCase();

      setItems((prev) => {
        const now = Date.now();
        const index = prev.findIndex((item) => item.normalized === normalized);
        if (index >= 0) {
          const current = prev[index];
          const updated: SearchHistoryItem = {
            ...current,
            query: trimmed,
            count: current.count + 1,
            updatedAt: now,
          };
          const next = [updated, ...prev.filter((item) => item.id !== current.id)];
          return next.slice(0, limit);
        }

        const nextItem: SearchHistoryItem = {
          id: createId(),
          query: trimmed,
          normalized,
          count: 1,
          updatedAt: now,
        };
        return [nextItem, ...prev].slice(0, limit);
      });
    },
    [limit, minLength],
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => b.updatedAt - a.updatedAt),
    [items],
  );

  return {
    items: sortedItems,
    addQuery,
    remove,
    clear,
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
