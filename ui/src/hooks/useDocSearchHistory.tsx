import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Modal, Tag } from "antd";
import type { AutoCompleteProps } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";

const SEARCH_HISTORY_KEY = "ts-swagger-search-history";
const MAX_HISTORY = 10;

type SearchRecord = {
  id: string;
  label: string;
  value: string;
  updatedAt: number;
};

type UseDocSearchHistoryOptions = {
  onRename?: (record: SearchRecord, nextLabel: string) => void;
  savedDocUrls?: string[];
};

function normalizeDocUrl(value?: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  try {
    const url = trimmed.startsWith("/")
      ? new URL(trimmed, window.location.origin)
      : new URL(/^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

export function useDocSearchHistory(options: UseDocSearchHistoryOptions = {}) {
  const { onRename, savedDocUrls = [] } = options;
  const [searchHistory, setSearchHistory] = useState<SearchRecord[]>(() => {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => item?.value).slice(0, MAX_HISTORY);
      }
      return [];
    } catch {
      return [];
    }
  });
  const [renameTarget, setRenameTarget] = useState<SearchRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const lastRecordedIpRef = useRef("");

  const createRecordId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `history-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const recordSearch = useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setSearchHistory((prev) => {
      const existing = prev.find((item) => item.value === normalized);
      const label = existing?.label ?? normalized;
      const nextItem: SearchRecord = {
        id: existing?.id ?? createRecordId(),
        label,
        value: normalized,
        updatedAt: Date.now(),
      };
      const nextList = [nextItem, ...prev.filter((item) => item.value !== normalized)];
      return nextList.slice(0, MAX_HISTORY);
    });
  }, []);

  const upsertSearchRecord = useCallback((value: string, label?: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setSearchHistory((prev) => {
      const existing = prev.find((item) => item.value === normalized);
      const nextItem: SearchRecord = {
        id: existing?.id ?? createRecordId(),
        label: label?.trim() || existing?.label || normalized,
        value: normalized,
        updatedAt: Date.now(),
      };
      const nextList = [nextItem, ...prev.filter((item) => item.value !== normalized)];
      return nextList.slice(0, MAX_HISTORY);
    });
  }, []);

  const renameSearchRecordByValue = useCallback((value: string, label: string) => {
    const normalized = value.trim();
    const nextLabel = label.trim();
    if (!normalized || !nextLabel) return;
    setSearchHistory((prev) => {
      const existing = prev.find((item) => item.value === normalized);
      if (!existing) {
        return [{
          id: createRecordId(),
          label: nextLabel,
          value: normalized,
          updatedAt: Date.now(),
        }, ...prev].slice(0, MAX_HISTORY);
      }
      const nextItem: SearchRecord = {
        ...existing,
        label: nextLabel,
        updatedAt: Date.now(),
      };
      return [nextItem, ...prev.filter((item) => item.id !== existing.id)].slice(0, MAX_HISTORY);
    });
  }, []);

  const getLabelByValue = useCallback((value: string) => {
    const normalized = value.trim();
    return searchHistory.find((item) => item.value === normalized)?.label;
  }, [searchHistory]);

  const recordSearchOnce = useCallback(
    (value: string) => {
      if (lastRecordedIpRef.current === value) return;
      recordSearch(value);
      lastRecordedIpRef.current = value;
    },
    [recordSearch],
  );

  const handleRename = useCallback((record: SearchRecord, event?: MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    setRenameTarget(record);
    setRenameValue(record.label);
  }, []);

  const confirmRename = useCallback(() => {
    if (!renameTarget) return;
    const nextLabel = renameValue.trim();
    if (!nextLabel) {
      setRenameTarget(null);
      return;
    }
    setSearchHistory((prev) =>
      prev.map((item) =>
        item.id === renameTarget.id ? { ...item, label: nextLabel } : item,
      ),
    );
    onRename?.(renameTarget, nextLabel);
    setRenameTarget(null);
  }, [onRename, renameTarget, renameValue]);

  const handleDelete = useCallback((record: SearchRecord, event?: MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    Modal.confirm({
      title: "删除记录",
      content: `确定删除 ${record.label} 吗？`,
      okText: "删除",
      cancelText: "取消",
      onOk: () => {
        setSearchHistory((prev) => prev.filter((item) => item.id !== record.id));
      },
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
    } catch {
      // ignore
    }
  }, [searchHistory]);

  const historyOptions = useMemo(
    () =>
      searchHistory.map((record) => {
        const isSaved = savedDocUrls.some((url) => normalizeDocUrl(url) === normalizeDocUrl(record.value));
        return {
          key: `history-${record.id}`,
          value: record.value,
          label: (
            <div className="search-history-option">
              <div className="search-history-text">
                <span className="search-history-label-row">
                  <span className="search-history-label" title={record.label}>
                    {record.label}
                  </span>
                  {isSaved ? <Tag className="search-history-saved-tag" color="success">已保存</Tag> : null}
                </span>
                {record.label !== record.value && (
                  <span className="search-history-value" title={record.value}>
                    {record.value}
                  </span>
                )}
              </div>
              <div className="search-history-actions">
                <span
                  className="search-history-action"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => handleRename(record, event)}
                >
                  <EditOutlined />
                </span>
                <span
                  className="search-history-action"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => handleDelete(record, event)}
                >
                  <DeleteOutlined />
                </span>
              </div>
            </div>
          ),
        };
      }),
    [handleDelete, handleRename, savedDocUrls, searchHistory],
  );

  const autoCompleteOptions = useMemo(() => {
    const groups: AutoCompleteProps["options"] = [];
    if (historyOptions.length) {
      groups.push({
        key: "history-group",
        label: "搜索记录",
        options: historyOptions,
      });
    }
    return groups;
  }, [historyOptions]);

  return {
    autoCompleteOptions,
    renameTarget,
    renameValue,
    setRenameTarget,
    setRenameValue,
    confirmRename,
    recordSearchOnce,
    upsertSearchRecord,
    renameSearchRecordByValue,
    getLabelByValue,
  };
}
