import React, { useEffect, useMemo, useState } from "react";
import { Alert, Empty, Modal, Segmented, Spin } from "antd";
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
  currentServiceLabel?: string;
  allServiceGroups?: AllServiceSearchGroup[];
  loadAllServiceGroups?: () => Promise<AllServiceSearchGroup[]>;
  onSelectResult?: (selectedKey: string, context?: SearchResultSelectContext) => void;
  triggerClassName?: string;
};

export type AllServiceSearchGroup = {
  serviceName: string;
  serviceValue?: string;
  groups: ApiListProps["apis"];
};

export type SearchResultSelectContext = {
  serviceValue?: string;
};

type SearchScope = "current" | "all";

const ApiSearchDialog: React.FC<ApiSearchDialogProps> = ({
  apis,
  onSelectResult,
  triggerClassName,
  currentServiceLabel,
  allServiceGroups,
  loadAllServiceGroups,
}) => {
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("current");
  const [loadedAllServiceGroups, setLoadedAllServiceGroups] = useState<AllServiceSearchGroup[]>([]);
  const [loadingAllServices, setLoadingAllServices] = useState(false);
  const [allServiceError, setAllServiceError] = useState<string | null>(null);
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
  const canSearchAllServices = Boolean(allServiceGroups?.length || loadAllServiceGroups);

  useEffect(() => {
    if (!allServiceGroups) return;
    setLoadedAllServiceGroups(allServiceGroups);
  }, [allServiceGroups]);

  useEffect(() => {
    if (!open || scope !== "all" || !canSearchAllServices) return;
    if (allServiceGroups?.length || loadedAllServiceGroups.length || !loadAllServiceGroups) return;

    let cancelled = false;
    setLoadingAllServices(true);
    setAllServiceError(null);
    void loadAllServiceGroups()
      .then((groups) => {
        if (cancelled) return;
        setLoadedAllServiceGroups(groups);
      })
      .catch((error) => {
        if (cancelled) return;
        const text = error instanceof Error ? error.message : String(error);
        setAllServiceError(text);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingAllServices(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    allServiceGroups?.length,
    canSearchAllServices,
    loadAllServiceGroups,
    loadedAllServiceGroups.length,
    open,
    scope,
  ]);

  const searchGroups = useMemo(() => {
    if (scope === "all" && canSearchAllServices) {
      return loadedAllServiceGroups.flatMap((service) =>
        service.groups.map((group) => ({
          ...group,
          serviceName: service.serviceName,
          serviceValue: service.serviceValue,
        })),
      );
    }
    return apis.map((group) => ({
      ...group,
      serviceName: currentServiceLabel,
      serviceValue: searchParams.get("service") ?? undefined,
    }));
  }, [apis, canSearchAllServices, currentServiceLabel, loadedAllServiceGroups, scope, searchParams]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [] as SearchResultItemData[];

    const matched: Array<SearchResultItemData & { score: number }> = [];

    searchGroups.forEach((group) => {
      group.children.forEach((item) => {
        const matchInfo = getMatchInfo(item, normalized);
        if (!matchInfo) return;
        matched.push({
          matchType: matchInfo.matchType,
          groupName: group.name,
          serviceName: group.serviceName,
          serviceValue: group.serviceValue,
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
      serviceName: result.serviceName,
      serviceValue: result.serviceValue,
      item: result.item,
    }));
  }, [query, searchGroups]);

  const hasResults = results.length > 0;

  const handleSelect = (key: string, context?: SearchResultSelectContext) => {
    addQuery(query);
    onSelectResult?.(key, context);
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
        {canSearchAllServices ? (
          <Segmented
            className="mb-3"
            value={scope}
            onChange={(value) => setScope(value as SearchScope)}
            options={[
              { label: "当前服务", value: "current" },
              { label: "全部服务", value: "all" },
            ]}
          />
        ) : null}
        <SearchBar
          value={query}
          onChange={setQuery}
          autoFocus
          placeholder="输入路径、名称、operationId 或模型"

        />
        <div className="mt-4 max-h-[420px] space-y-4 overflow-y-auto pr-1">
          {scope === "all" && loadingAllServices ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
              <Spin size="small" />
              <span>正在加载全部服务接口...</span>
            </div>
          ) : null}
          {scope === "all" && allServiceError ? (
            <Alert type="warning" showIcon message={`全部服务搜索加载失败：${allServiceError}`} />
          ) : null}
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
                  key={`${result.serviceValue ?? "current"}-${result.item.key}`}
                  data={result}
                  onSelect={(key) => handleSelect(key, { serviceValue: result.serviceValue })}
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
