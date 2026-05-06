import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const VIEWED_API_TABS_KEY = "ts-swagger-viewed-api-tabs";
const MAX_VIEWED_API_TABS = 12;

type UseViewedApiTabsParams = {
  viewedContextKey: string;
  selectedApiKey: string | null;
  apiMap: Map<string, unknown>;
  onSelectApi: (key?: string) => void;
};

export function useViewedApiTabs(params: UseViewedApiTabsParams) {
  const { viewedContextKey, selectedApiKey, apiMap, onSelectApi } = params;
  const [viewedApiKeys, setViewedApiKeys] = useState<string[]>([]);
  const [pinnedApiKeys, setPinnedApiKeys] = useState<string[]>([]);
  const skipNextViewedTabsPersistRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEWED_API_TABS_KEY);
      if (!raw) {
        skipNextViewedTabsPersistRef.current = true;
        setViewedApiKeys([]);
        setPinnedApiKeys([]);
        return;
      }
      const parsed = JSON.parse(raw) as Record<
        string,
        string[] | { keys?: string[]; pinned?: string[] }
      >;
      const entry = parsed?.[viewedContextKey];
      const list = Array.isArray(entry) ? entry : entry?.keys;
      const pinnedList = Array.isArray(entry) ? [] : (entry?.pinned ?? []);
      if (!Array.isArray(list)) {
        skipNextViewedTabsPersistRef.current = true;
        setViewedApiKeys([]);
        setPinnedApiKeys([]);
        return;
      }
      const normalizedList = list
        .filter((key) => typeof key === "string" && key.length > 0)
        .slice(-MAX_VIEWED_API_TABS);
      const normalizedPinned = pinnedList
        .filter((key) => normalizedList.includes(key))
        .slice(-MAX_VIEWED_API_TABS);
      skipNextViewedTabsPersistRef.current = true;
      setViewedApiKeys(normalizedList);
      setPinnedApiKeys(normalizedPinned);
    } catch {
      skipNextViewedTabsPersistRef.current = true;
      setViewedApiKeys([]);
      setPinnedApiKeys([]);
    }
  }, [viewedContextKey]);

  useEffect(() => {
    if (skipNextViewedTabsPersistRef.current) {
      skipNextViewedTabsPersistRef.current = false;
      return;
    }
    try {
      const raw = localStorage.getItem(VIEWED_API_TABS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      parsed[viewedContextKey] = {
        keys: viewedApiKeys.slice(-MAX_VIEWED_API_TABS),
        pinned: pinnedApiKeys
          .filter((key) => viewedApiKeys.includes(key))
          .slice(-MAX_VIEWED_API_TABS),
      };
      localStorage.setItem(VIEWED_API_TABS_KEY, JSON.stringify(parsed));
    } catch {
      // ignore
    }
  }, [pinnedApiKeys, viewedApiKeys, viewedContextKey]);

  useEffect(() => {
    if (!selectedApiKey || !apiMap.has(selectedApiKey)) return;
    setViewedApiKeys((prev) => {
      if (prev.includes(selectedApiKey)) return prev;
      const next = [...prev, selectedApiKey];
      if (next.length <= MAX_VIEWED_API_TABS) return next;
      return next.slice(next.length - MAX_VIEWED_API_TABS);
    });
  }, [apiMap, selectedApiKey]);

  useEffect(() => {
    setPinnedApiKeys((prev) => prev.filter((key) => viewedApiKeys.includes(key)));
  }, [viewedApiKeys]);

  const orderedViewedApiKeys = useMemo(() => {
    const pinnedSet = new Set(pinnedApiKeys);
    const pinned = viewedApiKeys.filter((key) => pinnedSet.has(key));
    const unpinned = viewedApiKeys.filter((key) => !pinnedSet.has(key));
    return [...pinned, ...unpinned];
  }, [pinnedApiKeys, viewedApiKeys]);

  const removeViewedTab = useCallback(
    (targetKey: string) => {
      const idx = viewedApiKeys.indexOf(targetKey);
      if (idx < 0) return;

      const remaining = viewedApiKeys.filter((key) => key !== targetKey);
      setViewedApiKeys(remaining);
      setPinnedApiKeys((prev) => prev.filter((key) => key !== targetKey));

      if (selectedApiKey !== targetKey) return;

      const fallbackIndex = Math.min(idx, remaining.length - 1);
      const fallbackKey = fallbackIndex >= 0 ? remaining[fallbackIndex] : "";
      onSelectApi(fallbackKey || undefined);
    },
    [onSelectApi, selectedApiKey, viewedApiKeys],
  );

  const closeOtherViewedTabs = useCallback(
    (keepKey: string) => {
      setViewedApiKeys((prev) => {
        if (!prev.includes(keepKey)) return prev;
        if (prev.length === 1 && prev[0] === keepKey) return prev;
        return [keepKey];
      });
      setPinnedApiKeys((prev) => (prev.includes(keepKey) ? [keepKey] : []));

      if (selectedApiKey && selectedApiKey !== keepKey) {
        onSelectApi(keepKey);
      }
    },
    [onSelectApi, selectedApiKey],
  );

  const togglePinViewedTab = useCallback(
    (targetKey: string) => {
      if (!viewedApiKeys.includes(targetKey)) return;
      setPinnedApiKeys((prev) => {
        if (prev.includes(targetKey)) return prev.filter((key) => key !== targetKey);
        return [...prev, targetKey];
      });
    },
    [viewedApiKeys],
  );

  return {
    viewedApiKeys,
    pinnedApiKeys,
    orderedViewedApiKeys,
    removeViewedTab,
    closeOtherViewedTabs,
    togglePinViewedTab,
  };
}
