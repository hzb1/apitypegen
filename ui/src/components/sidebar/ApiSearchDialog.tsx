import React, { useMemo, useState } from "react";
import { Empty, Modal } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useSearchParams } from "react-router";
import SearchBar from "../ui/SearchBar/SearchBar.tsx";
import type { ApiListProps } from "../ApiList/ApiList.tsx";
import ApiSearchResultItem, {
  type SearchMatchType,
  type SearchResultItemData,
} from "./ApiSearchResultItem.tsx";
import { useSearchHistory } from "@/hooks/useSearchHistory.ts";
import SearchHistoryList from "./SearchHistoryList.tsx";

type ApiSearchDialogProps = {
  apis: ApiListProps["apis"];
  onSelectResult?: (selectedKey: string) => void;
  triggerClassName?: string;
};

const ApiSearchDialog: React.FC<ApiSearchDialogProps> = ({
  apis,
  onSelectResult,
  triggerClassName,
}) => {
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const serviceScope = useMemo(() => {
    const rawService = searchParams.get("service")?.trim();
    return rawService && rawService.length > 0 ? rawService : "__default__";
  }, [searchParams]);
  const historyStorageKey = useMemo(
    () => `ts-swagger-api-search-history-v1::service=${serviceScope}`,
    [serviceScope],
  );
  const { items: historyItems, addQuery, remove, clear } = useSearchHistory({
    storageKey: historyStorageKey,
    limit: 20,
    minLength: 2,
  });

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [] as SearchResultItemData[];

    const matched: Array<SearchResultItemData & { score: number }> = [];

    apis.forEach((group) => {
      group.children.forEach((item) => {
        const matchInfo = getMatchInfo(item, normalized);
        if (!matchInfo) return;
        matched.push({
          matchType: matchInfo.matchType,
          groupName: group.name,
          item,
          score: matchInfo.score + (item.isSelected ? 1 : 0),
        });
      });
    });

    matched.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.path.localeCompare(b.item.path);
    });

    return matched.map((result) => ({
      matchType: result.matchType,
      groupName: result.groupName,
      item: result.item,
    }));
  }, [apis, query]);

  const hasResults = results.length > 0;

  const handleSelect = (key: string) => {
    addQuery(query);
    onSelectResult?.(key);
    setOpen(false);
  };

  const handleUseHistory = (historyQuery: string) => {
    setQuery(historyQuery);
  };

  return (
    <>
      <button
        type="button"
        className={
          `flex h-8 w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-left text-sm text-gray-500 transition hover:border-gray-300 hover:text-gray-700 cursor-pointer ${triggerClassName ?? ""}`
        }
        onClick={() => setOpen(true)}
      >
        <SearchOutlined />
        <span className="truncate">搜索路径或方法</span>
      </button>

      <Modal
        title="搜索接口"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnHidden
        width={600}
      >
        <SearchBar
          value={query}
          onChange={setQuery}
          autoFocus
          placeholder="输入路径、名称、operationId 或模型"

        />
        <div className="mt-4 max-h-[420px] space-y-4 overflow-y-auto pr-1">
          {query.trim() && !hasResults ? (
            <Empty description="未找到匹配接口" />
          ) : null}
          {!query.trim() ? (
            <SearchHistoryList
              items={historyItems}
              onUse={handleUseHistory}
              onRemove={remove}
              onClear={clear}
            />
          ) : null}
          {query.trim() && hasResults ? (
            <div className="space-y-2">
              {results.map((result) => (
                <ApiSearchResultItem
                  key={result.item.key}
                  data={result}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
};

function getMatchInfo(
  item: ApiListProps["apis"][number]["children"][number],
  query: string,
): { matchType: SearchMatchType; score: number } | null {
  const path = item.path.toLowerCase();
  const summary = item.operation?.summary?.toLowerCase() ?? "";
  const operationId = item.operation?.operationId?.toLowerCase() ?? "";
  const method = item.method.toLowerCase();

  if (path === query) return { matchType: "路径", score: 120 };
  if (path.startsWith(query)) return { matchType: "路径", score: 100 };
  if (path.includes(query)) return { matchType: "路径", score: 90 };

  if (summary.startsWith(query)) return { matchType: "名称", score: 80 };
  if (summary.includes(query)) return { matchType: "名称", score: 70 };

  if (operationId.startsWith(query)) return { matchType: "ID", score: 60 };
  if (operationId.includes(query)) return { matchType: "ID", score: 50 };

  const modelNames = getModelNamesFromOperation(item.operation);
  if (modelNames.some((name) => name === query)) {
    return { matchType: "模型", score: 65 };
  }
  if (modelNames.some((name) => name.startsWith(query))) {
    return { matchType: "模型", score: 55 };
  }
  if (modelNames.some((name) => name.includes(query))) {
    return { matchType: "模型", score: 45 };
  }

  if (method.startsWith(query)) return { matchType: "方法", score: 40 };
  if (method.includes(query)) return { matchType: "方法", score: 30 };

  return null;
}

const operationModelNamesCache = new WeakMap<object, string[]>();

function getModelNamesFromOperation(operation: unknown): string[] {
  if (!operation || typeof operation !== "object") return [];
  const cacheHit = operationModelNamesCache.get(operation);
  if (cacheHit) return cacheHit;

  const result = new Set<string>();
  const visited = new WeakSet<object>();

  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const obj = value as Record<string, unknown>;

    if (visited.has(obj)) return;
    visited.add(obj);

    const ref = obj.$ref;
    if (typeof ref === "string") {
      const refName = ref.split("/").pop() ?? "";
      if (refName) {
        result.add(refName.toLowerCase());
      }
    }

    Object.values(obj).forEach((child) => {
      walk(child);
    });
  };

  walk(operation);
  const collected = Array.from(result);
  operationModelNamesCache.set(operation, collected);
  return collected;
}

export default ApiSearchDialog;
