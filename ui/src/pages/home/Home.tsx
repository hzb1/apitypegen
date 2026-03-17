import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  AutoComplete,
  Dropdown,
  Input,
  InputNumber,
  Select,
  Spin,
  Tabs,
  Empty,
  Modal,
  Alert,
  Button,
  Switch,
  Tooltip,
  Drawer,
} from "antd";
import {type AutoCompleteProps} from "antd";
import "./Home.css";
import {useSwagger} from "@/hooks/useSwagger.ts";
import {useOptions} from "@/hooks/useOptions.ts";
import {DeleteOutlined, EditOutlined, MenuOutlined, PushpinOutlined, QuestionCircleOutlined, SettingOutlined} from "@ant-design/icons";
import {usePluginEnabled} from "@/hooks/usePluginEnabled.ts";
import {useSearchParams} from "react-router";
import SideBar, {
  type SideBarProps,
} from "@/components/sidebar/SideBar.tsx";
import ApiInfo from "@/components/api-info/ApiInfo.tsx";
import CodeCard from "@/components/code-card/CodeCard.tsx";
import ThemeDropdown from "@/components/theme/ThemeDropdown.tsx";
import type {ApiDetail} from "../../../types.ts";
import {getApiSlug, stableHash} from "@/utils/getApiSlug.ts";
import type {ApiGroup} from "./utils.ts";
import logoUrl from "@/assets/logo/logo-replica-full.svg";

const SEARCH_HISTORY_KEY = "ts-swagger-search-history";
const VIEWED_API_TABS_KEY = "ts-swagger-viewed-api-tabs";
const MAX_HISTORY = 10;
const MAX_VIEWED_API_TABS = 12;
const EXTENSION_URL =
  (import.meta.env.VITE_PROXY_EXTENSION_URL as string | undefined) ??
  "https://github.com/hzb1/ts-swagger/releases/latest/download/ts-swagger-extension-dist-latest.zip";

type SearchRecord = {
  id: string;
  label: string;
  value: string;
  updatedAt: number;
};

type ScrollRequest = {
  key: string;
  id: number;
};

type TsCodeParts = {
  Models: string;
  "Query Params": string;
  "Request Body": string;
  "Response Data": string;
};

const Home: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const ipFromUrl = searchParams.get("doc")?.trim() ?? searchParams.get("ip")?.trim() ?? "";
  const serviceUrl = searchParams.get("service") ?? undefined;
  const selectedApiKey = searchParams.get("api");
  const hasIpParam = Boolean(ipFromUrl);
  const normalizedDocInput = useMemo(() => {
    if (!ipFromUrl) return "";
    return /^https?:\/\//.test(ipFromUrl) ? ipFromUrl : `http://${ipFromUrl}`;
  }, [ipFromUrl]);

  // const queryApiKey = searchParams.get("api");

  const [inputIp, setInputIp] = useState(ipFromUrl);
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false);
  const lastRecordedIpRef = useRef("");
  const scrollRequestIdRef = useRef(0);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | undefined>(undefined);

  const {documentData, configData, stage, error} = useSwagger({
    docOrHost: ipFromUrl,
    ip: ipFromUrl,
    serviceUrl,
    options: {
      // 当 Hook 发现配置加载好了但 URL 没 service 时触发
      onAutoSelectService: (defaultUrl) => {
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.set("service", defaultUrl);
          return next;
        }, {replace: true});
      },
      onDocumentLoaded: () => {
        // no-op
      },
    }
  });

  const configLoading = stage === 'config';
  const docLoading = stage === 'document';

  const loading = configLoading || docLoading;

  const groupedApis = useMemo(() => {
    // 这里的 documentData 来自 useSwagger()
    if (!documentData?.paths) return {};

    const groups: Record<string, ApiDetail[]> = {};

    for (const [path, item] of Object.entries(documentData.paths)) {
      // 遍历所有 HTTP 方法
      for (const method of ["get", "post", "put", "delete", "patch"] as const) {
        const op = (item)[method];
        if (!op) continue;

        const tag = op.tags?.[0] ?? "Default";
        (groups[tag] ||= []).push({
          key: getApiSlug({path, method, operation: op}),
          path,
          method,
          operation: op,
        });
      }
    }

    return groups;
  }, [documentData]);

  // 2. 调用配置持久化逻辑
  const {configState, setConfigState, generatorOptions} = useOptions();

  const selectedApi = useMemo(() => {
    if (!selectedApiKey) return null;
    const apiList = Object.entries(groupedApis).map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ([_tag, apis]) => apis,
    );
    let findApi: ApiDetail;
    apiList?.forEach((apis) => {
      apis.forEach((api) => {
        if (selectedApiKey === api.key) {
          findApi = api;
        }
      });
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return findApi;
  }, [groupedApis, selectedApiKey]);

  const apiMap = useMemo(() => {
    const map = new Map<string, ApiDetail>();
    Object.values(groupedApis).forEach((apis) => {
      apis.forEach((api) => map.set(api.key, api));
    });
    return map;
  }, [groupedApis]);

  const [expandedGroupList, setExpandedGroupList] = useState<string[]>([]);

  const handleGroupTitleClick = (groupItem: ApiGroup) => {
    const groupId = groupItem.id;
    setExpandedGroupList((prev) => {
      if (prev.includes(groupId)) {
        return prev.filter((id) => id !== groupId);
      }
      return [...prev, groupId];
    });
  };

  const {pluginEnabled, checking} = usePluginEnabled();
  const [viewedApiKeys, setViewedApiKeys] = useState<string[]>([]);
  const [pinnedApiKeys, setPinnedApiKeys] = useState<string[]>([]);
  const viewedContextKey = useMemo(
    () => `${ipFromUrl}__${serviceUrl ?? ""}`,
    [ipFromUrl, serviceUrl],
  );
  const skipNextViewedTabsPersistRef = useRef(false);

  const handleCommitIp = (nextIp: string) => {
    const normalized = nextIp.trim();
    setInputIp(normalized);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("doc", normalized);
      next.delete("ip");
      next.delete("api"); // 切换 IP 时建议清除旧的 API 选中态
      next.delete("service"); // 切换 IP 时也清除旧的服务，触发 Hook 的自动补全
      return next;
    });
  };

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
      const nextList = [
        nextItem,
        ...prev.filter((item) => item.value !== normalized),
      ];
      return nextList.slice(0, MAX_HISTORY);
    });
  }, []);

  const handleRename = useCallback(
    (record: SearchRecord, event?: React.MouseEvent) => {
      event?.preventDefault();
      event?.stopPropagation();
      setRenameTarget(record);
      setRenameValue(record.label);
    },
    [],
  );

  const confirmRename = useCallback(() => {
    if (!renameTarget) return;
    const nextLabel = renameValue.trim();
    if (!nextLabel) {
      setRenameTarget(null);
      return;
    }
    setSearchHistory((prev) =>
      prev.map((item) =>
        item.id === renameTarget.id ? {...item, label: nextLabel} : item,
      ),
    );
    setRenameTarget(null);
  }, [renameTarget, renameValue]);

  const handleDelete = useCallback((record: SearchRecord, event?: React.MouseEvent) => {
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
    setInputIp(ipFromUrl);
  }, [ipFromUrl]);

  useEffect(() => {
    if (!documentData) return;
    if (lastRecordedIpRef.current === ipFromUrl) return;
    recordSearch(ipFromUrl);
    lastRecordedIpRef.current = ipFromUrl;
  }, [documentData, ipFromUrl, recordSearch]);

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
    } catch {
      // ignore
    }
  }, [searchHistory]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEWED_API_TABS_KEY);
      if (!raw) {
        skipNextViewedTabsPersistRef.current = true;
        setViewedApiKeys([]);
        setPinnedApiKeys([]);
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, string[] | {
        keys?: string[];
        pinned?: string[];
      }>;
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
        pinned: pinnedApiKeys.filter((key) => viewedApiKeys.includes(key)).slice(-MAX_VIEWED_API_TABS),
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

  const historyOptions = useMemo(
    () =>
      searchHistory.map((record) => ({
        key: `history-${record.id}`,
        value: record.value,
        label: (
          <div className="search-history-option">
            <div className="search-history-text">
              <span className="search-history-label" title={record.label}>{record.label}</span>
              {record.label !== record.value && (
                <span className="search-history-value" title={record.value}>{record.value}</span>
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
                <EditOutlined/>
              </span>
              <span
                className="search-history-action"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => handleDelete(record, event)}
              >
                <DeleteOutlined/>
              </span>
            </div>
          </div>
        ),
      })),
    [searchHistory, handleDelete, handleRename],
  );

  const autoCompleteOptions = useMemo(() => {
    const groups: AutoCompleteProps['options'] = [];
    if (historyOptions.length) {
      groups.push({label: "搜索记录", options: historyOptions, key: "history-group"});
    }
    return groups;
  }, [historyOptions]);

  const apiKeyToGroupId = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(groupedApis).forEach(([tag, apis]) => {
      const groupId = stableHash(tag);
      apis.forEach((api) => {
        map.set(api.key, groupId);
      });
    });
    return map;
  }, [groupedApis]);

  /**
   * 菜单选择回调
   */
  const onMenuSelect = (key: string) => {
    const targetGroupId = apiKeyToGroupId.get(key);
    if (targetGroupId) {
      setExpandedGroupList((prev) => (
        prev.includes(targetGroupId) ? prev : [...prev, targetGroupId]
      ));
    }
    setMobileNavOpen(false);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("api", key);
      return next;
    });
  };

  const onViewedTabSelect = (key: string) => {
    scrollRequestIdRef.current += 1;
    setScrollRequest({
      key,
      id: scrollRequestIdRef.current,
    });
    onMenuSelect(key);
  };

  const formatPathTabLabel = (path: string) => {
    const normalized = path.split("?")[0].replace(/\/+$/, "");
    const segments = normalized.split("/").filter(Boolean);
    if (!segments.length) return path || "/";
    return `/${segments[segments.length - 1]}`;
  };

  const handleToolbarSearchSelect = (key: string) => {
    setMobileNavOpen(false);
    onViewedTabSelect(key);
  };

  const handleRemoveViewedTab = useCallback((targetKey: string) => {
    const idx = viewedApiKeys.indexOf(targetKey);
    if (idx < 0) return;

    const remaining = viewedApiKeys.filter((key) => key !== targetKey);
    setViewedApiKeys(remaining);
    setPinnedApiKeys((prev) => prev.filter((key) => key !== targetKey));

    if (selectedApiKey !== targetKey) return;

    const fallbackIndex = Math.min(idx, remaining.length - 1);
    const fallbackKey = fallbackIndex >= 0 ? remaining[fallbackIndex] : "";
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (fallbackKey) {
        next.set("api", fallbackKey);
      } else {
        next.delete("api");
      }
      return next;
    });
  }, [selectedApiKey, setSearchParams, viewedApiKeys]);

  const handleCloseOtherViewedTabs = useCallback((keepKey: string) => {
    setViewedApiKeys((prev) => {
      if (!prev.includes(keepKey)) return prev;
      if (prev.length === 1 && prev[0] === keepKey) return prev;
      return [keepKey];
    });
    setPinnedApiKeys((prev) => (prev.includes(keepKey) ? [keepKey] : []));

    if (selectedApiKey && selectedApiKey !== keepKey) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("api", keepKey);
        return next;
      });
    }
  }, [selectedApiKey, setSearchParams]);

  const handleTogglePinViewedTab = useCallback((targetKey: string) => {
    if (!viewedApiKeys.includes(targetKey)) return;
    setPinnedApiKeys((prev) => {
      if (prev.includes(targetKey)) return prev.filter((key) => key !== targetKey);
      return [...prev, targetKey];
    });
  }, [viewedApiKeys]);

  const [tsCodeParts, setTsCodeParts] = useState<TsCodeParts | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    if (!documentData || !selectedApi) {
      setTsCodeParts(undefined);
      return () => {
        cancelled = true;
      };
    }

    setTsCodeParts(undefined);

    const loadTsCodeParts = async () => {
      const {SwaggerToTS} = await import("@/utils/SwaggerParser.ts");
      const parser = new SwaggerToTS(documentData, generatorOptions);
      const res = parser.getStructuredTypes(selectedApi.path, selectedApi.method);

      if (cancelled) return;

      setTsCodeParts({
        Models: res.models,
        "Query Params": res.queryParams,
        "Request Body": res.requestBody,
        "Response Data": res.responseData,
      });
    };

    void loadTsCodeParts();

    return () => {
      cancelled = true;
    };
  }, [documentData, generatorOptions, selectedApi]);

  const handleServiceChange = (url?: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (url) {
        next.set("service", url);
      } else {
        next.delete("service");
      }
      next.delete("api");
      return next;
    });
  };

  const serviceOptions = useMemo(() => {
    return (
      configData?.urls.map((item) => ({
        label: item.name,
        value: item.url,
      })) || []
    );
  }, [configData?.urls]);

  const apiBaseUrl = useMemo(() => {
    if (!documentData) return "";

    const docRecord = documentData as Record<string, unknown>;
    const serverList = docRecord.servers as Array<{url?: string}> | undefined;
    const serverUrl = serverList?.find((item) => typeof item?.url === "string" && item.url.trim())?.url?.trim();
    if (serverUrl) {
      try {
        const resolved = /^https?:\/\//.test(serverUrl)
          ? serverUrl
          : normalizedDocInput
            ? new URL(serverUrl, normalizedDocInput).toString()
            : serverUrl;
        return resolved.replace(/\/+$/, "");
      } catch {
        // ignore and fallback
      }
    }

    const host = typeof docRecord.host === "string" ? docRecord.host.trim() : "";
    if (host) {
      const schemes = Array.isArray(docRecord.schemes)
        ? docRecord.schemes.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        : [];
      const basePath = typeof docRecord.basePath === "string" ? docRecord.basePath : "";
      const fallbackScheme = (() => {
        try {
          return normalizedDocInput ? new URL(normalizedDocInput).protocol.replace(":", "") : "http";
        } catch {
          return "http";
        }
      })();
      const scheme = schemes[0] || fallbackScheme;
      return `${scheme}://${host}${basePath}`.replace(/\/+$/, "");
    }

    try {
      return normalizedDocInput ? new URL(normalizedDocInput).origin : "";
    } catch {
      return "";
    }
  }, [documentData, normalizedDocInput]);

  const apiGroups: SideBarProps["apis"] = useMemo(() => {
    return Object.entries(groupedApis).map(([tag, apis]) => {
      const id = stableHash(tag);

      const children = apis.map((api) => ({
        ...api,
        isSelected: Boolean(selectedApiKey) && api.key === selectedApiKey,
      }));

      return {
        id,
        isExpanded: expandedGroupList.includes(id),
        children,
        name: tag,
      };
    });
  }, [expandedGroupList, groupedApis, selectedApiKey]);

  useEffect(() => {
    setExpandedGroupList((prev) => {
      if (!apiGroups.length) {
        return prev.length ? [] : prev;
      }

      if (prev.length) return prev;
      const selectedGroupId = selectedApiKey ? apiKeyToGroupId.get(selectedApiKey) : undefined;
      return selectedGroupId ? [selectedGroupId] : prev;
    });
  }, [apiGroups, apiKeyToGroupId, selectedApiKey]);


  return (
    <>
      <Spin spinning={loading}>
        {hasIpParam ? (
          <div className="views">
            <header className="home-topbar">
              <div className="home-topbar-brand">
                <button
                  type="button"
                  className="mobile-nav-trigger"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <MenuOutlined />
                </button>
                <img src={logoUrl} alt="TS Swagger" className="home-topbar-logo" />
                <div className="home-topbar-copy">
                  <div className="home-topbar-title">API Hub</div>
                  <div className="home-topbar-subtitle">文档社区风 · 开发者入口</div>
                </div>
              </div>
              <div className="home-topbar-actions">
                <div className={'home-field-wrap'}>
                  <div className="field-row">
                    <div className="field-label">
                      <span>文档地址</span>
                      <Tooltip title="支持服务地址（自动探测）或可直接 GET 的 OpenAPI/Swagger 文档 URL">
                        <QuestionCircleOutlined className="field-help-icon" />
                      </Tooltip>
                    </div>
                    <div className="field-control">
                      <div className="doc-address-composer">
                        <AutoComplete
                          className="doc-address-auto"
                          value={inputIp}
                          onChange={setInputIp}
                          onSelect={handleCommitIp}
                          options={autoCompleteOptions}
                        >
                          <Input
                            placeholder="输入服务地址或 OpenAPI 文档 URL"
                            onPressEnter={(event) => handleCommitIp(event.currentTarget.value)}
                          />
                        </AutoComplete>
                        <button
                          type="button"
                          className="doc-load-button"
                          onClick={() => handleCommitIp(inputIp)}
                          disabled={!inputIp.trim() || loading}
                        >
                          {loading ? "加载中..." : "加载文档"}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="field-row">
                    <div className="field-label">
                      <span>服务</span>
                      <Tooltip title="当 swagger-config 返回多个服务时，在这里切换具体文档">
                        <QuestionCircleOutlined className="field-help-icon" />
                      </Tooltip>
                    </div>
                    <div className="field-control">
                      <Select
                        value={serviceUrl}
                        loading={configLoading}
                        onChange={handleServiceChange}
                        options={serviceOptions}
                        placeholder="选择服务"
                        allowClear
                        style={{
                          minWidth: '120px'
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="home-topbar-tools">
                  <Button
                    type="default"
                    icon={<SettingOutlined/>}
                    onClick={() => setConfigDrawerOpen(true)}
                  >
                    项目配置
                  </Button>
                  <ThemeDropdown />
                </div>
              </div>
            </header>

            <div className="home-main-shell">
              <aside className="home-sidebar">
                <SideBar
                  scrollRequest={scrollRequest}
                  apis={apiGroups}
                  onSelectKeyChange={onMenuSelect}
                  onGroupTitleClick={handleGroupTitleClick}
                  onSearchSelectResult={handleToolbarSearchSelect}
                />
              </aside>

              <main className="content-wrapper">
                <div className="content-api-tabs">
                  <div className="content-tab-heading">
                    <h2>已查看接口</h2>
                    <span>{orderedViewedApiKeys.length} 个</span>
                  </div>
                  {orderedViewedApiKeys.length > 0 ? (
                    <Tabs
                      className="doc-tabs-antd"
                      activeKey={selectedApiKey ?? undefined}
                      onChange={onViewedTabSelect}
                      type="editable-card"
                      hideAdd
                      onEdit={(targetKey, action) => {
                        if (action !== "remove" || typeof targetKey !== "string") return;
                        handleRemoveViewedTab(targetKey);
                      }}
                      items={orderedViewedApiKeys.flatMap((key) => {
                        const api = apiMap.get(key);
                        if (!api) return [];
                        const isPinned = pinnedApiKeys.includes(key);
                        const summary = api.operation?.summary?.trim();
                        const title = summary || formatPathTabLabel(api.path);
                        const tooltip = summary || api.path;
                        return [{
                          key,
                          label: (
                            <Dropdown
                              trigger={["contextMenu"]}
                              menu={{
                                items: [
                                  {
                                    key: "toggle-pin",
                                    label: isPinned ? "取消固定 Tab" : "固定 Tab",
                                    icon: <PushpinOutlined/>,
                                  },
                                  {key: "close-others", label: "删除其它 Tab"},
                                ],
                                onClick: ({key: actionKey}) => {
                                  if (actionKey === "toggle-pin") {
                                    handleTogglePinViewedTab(key);
                                    return;
                                  }
                                  if (actionKey === "close-others") {
                                    handleCloseOtherViewedTabs(key);
                                  }
                                },
                              }}
                            >
                              <span className="viewed-tab-label" title={tooltip}>
                                {isPinned ? `[固定] ${title}` : title}
                              </span>
                            </Dropdown>
                          ),
                          closable: true,
                        }];
                      })}
                    />
                  ) : (
                    <div className="content-viewed-empty">从左侧选择一个接口开始</div>
                  )}
                </div>

                <div className="content-scroll-area">
                  {error && <Empty description={error}/>}
                  {!error && selectedApi && (
                    <div className="api-workspace-grid">
                      <div className="left-main">
                        <ApiInfo api={selectedApi} codeMap={tsCodeParts} apiBaseUrl={apiBaseUrl}/>
                      </div>
                      <div className="models-panel">
                        <CodeCard title="Models" code={tsCodeParts?.Models} />
                      </div>
                    </div>
                  )}
                  {!error && !selectedApi && (
                    <Empty description="请选择左侧 API，开始查看文档与类型模型" />
                  )}
                </div>
              </main>
            </div>
            <Drawer
              title="接口导航"
              placement="left"
              open={mobileNavOpen}
              onClose={() => setMobileNavOpen(false)}
              size={320}
              className="mobile-nav-drawer"
            >
              <SideBar
                scrollRequest={scrollRequest}
                apis={apiGroups}
                onSelectKeyChange={onMenuSelect}
                onGroupTitleClick={handleGroupTitleClick}
                onSearchSelectResult={handleToolbarSearchSelect}
              />
            </Drawer>
            <Drawer
              title="项目配置"
              placement="right"
              size={460}
              open={configDrawerOpen}
              onClose={() => setConfigDrawerOpen(false)}
              className="project-config-drawer"
            >
              <div className="project-config-panel">
                <div className="project-config-item">
                  <span>展示 Example</span>
                  <Switch
                    checked={configState.showExample}
                    onChange={(checked) => setConfigState((prev) => ({...prev, showExample: checked}))}
                  />
                </div>
                <div className="project-config-item">
                  <span>Int64 转 String</span>
                  <Switch
                    checked={configState.int64ToString}
                    onChange={(checked) => setConfigState((prev) => ({...prev, int64ToString: checked}))}
                  />
                </div>
                <div className="project-config-item">
                  <span>生成 Interface</span>
                  <Switch
                    checked={configState.useInterface}
                    onChange={(checked) => setConfigState((prev) => ({...prev, useInterface: checked}))}
                  />
                </div>
                <div className="project-config-item">
                  <span>添加 Export</span>
                  <Switch
                    checked={configState.addExport}
                    onChange={(checked) => setConfigState((prev) => ({...prev, addExport: checked}))}
                  />
                </div>
                <div className="project-config-item">
                  <span>语句分号</span>
                  <Switch
                    checked={configState.semicolon}
                    onChange={(checked) => setConfigState((prev) => ({...prev, semicolon: checked}))}
                  />
                </div>
                <div className="project-config-item project-config-item-column">
                  <span>命名策略</span>
                  <Select
                    value={configState.namingStrategy || undefined}
                    onChange={(value) => setConfigState((prev) => ({...prev, namingStrategy: value ?? ""}))}
                    allowClear
                    options={[
                      {value: "removeVO", label: "去掉 VO 后缀"},
                      {value: "removeDTO", label: "去掉 DTO 后缀"},
                      {value: "prefixI", label: "添加 I 前缀"},
                    ]}
                    placeholder="不处理"
                  />
                </div>
                <div className="project-config-item project-config-item-column">
                  <span>缩进空格</span>
                  <InputNumber
                    min={0}
                    max={8}
                    value={configState.indent}
                    onChange={(value) => setConfigState((prev) => ({...prev, indent: typeof value === "number" ? value : 2}))}
                    style={{width: "100%"}}
                  />
                </div>
              </div>
            </Drawer>
          </div>
        ) : (
          <div className="home-welcome">
            <div className="home-welcome-card">
              <img src={logoUrl} alt="TS Swagger" className="home-welcome-logo" />
              <div className="home-welcome-title">TS Swagger</div>
              <div className="home-welcome-subtitle">
                开发者文档门户 · API 社区体验
              </div>
              <div className="home-welcome-hint">
                输入 Swagger/OpenAPI 文档 URL，快速生成可搜索、可调试、可复制代码的文档界面
              </div>
              <div className="home-welcome-search">
                <div className="home-welcome-composer">
                  <AutoComplete
                    className="home-welcome-auto"
                    value={inputIp}
                    onChange={(value) => setInputIp(value)}
                    onSelect={handleCommitIp}
                    options={autoCompleteOptions}
                  >
                    <Input
                      size="large"
                      placeholder="例如：http://localhost:9966/v3/api-docs"
                      onPressEnter={(event) => handleCommitIp(event.currentTarget.value)}
                    />
                  </AutoComplete>
                  <button
                    type="button"
                    className="welcome-load-button"
                    onClick={() => handleCommitIp(inputIp)}
                    disabled={!inputIp.trim() || loading}
                  >
                    {loading ? "加载中..." : "开始探索"}
                  </button>
                </div>
              </div>
            </div>

            {!checking && !pluginEnabled && (
              <Alert
                type="warning"
                showIcon
                title="未检测到浏览器扩展"
                description={
                  <div className="home-welcome-steps">
                    <div>安装步骤：</div>
                    <ol>
                      <li>1.点击“安装扩展”下载压缩包。</li>
                      <li>2.解压后打开浏览器扩展管理页。</li>
                      <li>3.开启“开发者模式”，选择“加载已解压的扩展”。</li>
                    </ol>
                  </div>
                }
                action={
                  <Button size="small" type="primary" href={EXTENSION_URL}>
                    下载扩展
                  </Button>
                }
                className="home-welcome-alert"
              />
            )}
          </div>
        )}
      </Spin>
      <Modal
        open={!!renameTarget}
        title="重命名记录"
        onOk={confirmRename}
        onCancel={() => setRenameTarget(null)}
        okText="保存"
        cancelText="取消"
      >
        <Input
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onPressEnter={confirmRename}
          placeholder="输入新的名称"
        />
      </Modal>
    </>
  );
};

export default Home;
