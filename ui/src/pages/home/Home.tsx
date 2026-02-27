import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  AutoComplete,
  Input,
  Row,
  Col,
  Spin,
  Tabs,
  Empty,
  Modal,
  Alert,
  Button,
} from "antd";
import {Layout, theme} from "antd";
import {type AutoCompleteProps} from "antd";
import "./Home.css";
import {useSwagger} from "@/hooks/useSwagger.ts";
import {useOptions} from "@/hooks/useOptions.ts";
import {DeleteOutlined, EditOutlined} from "@ant-design/icons";
import {usePluginEnabled} from "@/hooks/usePluginEnabled.ts";
import {useSearchParams} from "react-router";
import SideBar, {
  type SideBarProps,
} from "@/components/sidebar/SideBar.tsx";
import ApiInfo from "@/components/api-info/ApiInfo.tsx";
import CodeCard from "@/components/code-card/CodeCard.tsx";
import type {ApiDetail} from "../../../types.ts";
import {getApiSlug, stableHash} from "@/utils/getApiSlug.ts";
import {SwaggerToTS} from "@/utils/SwaggerParser.ts";
import type {ApiGroup} from "./utils.ts";

const {Sider} = Layout;

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

const Home: React.FC = () => {
  const {
    token: {colorBgContainer},
  } = theme.useToken();

  const [searchParams, setSearchParams] = useSearchParams();

  const ipFromUrl = searchParams.get("doc")?.trim() ?? searchParams.get("ip")?.trim() ?? "";
  const serviceUrl = searchParams.get("service") ?? undefined;
  const selectedApiKey = searchParams.get("api");
  const hasIpParam = Boolean(ipFromUrl);

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
  const {generatorOptions} = useOptions();

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
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      const list = parsed?.[viewedContextKey];
      if (!Array.isArray(list)) {
        skipNextViewedTabsPersistRef.current = true;
        setViewedApiKeys([]);
        return;
      }
      skipNextViewedTabsPersistRef.current = true;
      setViewedApiKeys(
        list
          .filter((key) => typeof key === "string" && key.length > 0)
          .slice(-MAX_VIEWED_API_TABS),
      );
    } catch {
      skipNextViewedTabsPersistRef.current = true;
      setViewedApiKeys([]);
    }
  }, [viewedContextKey]);

  useEffect(() => {
    if (skipNextViewedTabsPersistRef.current) {
      skipNextViewedTabsPersistRef.current = false;
      return;
    }
    try {
      const raw = localStorage.getItem(VIEWED_API_TABS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
      parsed[viewedContextKey] = viewedApiKeys.slice(-MAX_VIEWED_API_TABS);
      localStorage.setItem(VIEWED_API_TABS_KEY, JSON.stringify(parsed));
    } catch {
      // ignore
    }
  }, [viewedApiKeys, viewedContextKey]);

  useEffect(() => {
    if (!selectedApiKey || !apiMap.has(selectedApiKey)) return;
    setViewedApiKeys((prev) => {
      if (prev.includes(selectedApiKey)) return prev;
      const next = [...prev, selectedApiKey];
      if (next.length <= MAX_VIEWED_API_TABS) return next;
      return next.slice(next.length - MAX_VIEWED_API_TABS);
    });
  }, [apiMap, selectedApiKey]);

  const historyOptions = useMemo(
    () =>
      searchHistory.map((record) => ({
        key: `history-${record.id}`,
        value: record.value,
        label: (
          <div className="search-history-option">
            <div className="search-history-text">
              <span className="search-history-label">{record.label}</span>
              {record.label !== record.value && (
                <span className="search-history-value">{record.value}</span>
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

  const handleRemoveViewedTab = useCallback((targetKey: string) => {
    const idx = viewedApiKeys.indexOf(targetKey);
    if (idx < 0) return;

    const remaining = viewedApiKeys.filter((key) => key !== targetKey);
    setViewedApiKeys(remaining);

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

  const tsCodeParts = useMemo(() => {
    if (!documentData || !selectedApi) return;
    // 使用 useOptions 提供的 generatorOptions
    const parser = new SwaggerToTS(documentData, generatorOptions);
    const res = parser.getStructuredTypes(selectedApi.path, selectedApi.method);
    return {
      "Request Function": res.requestFunction,
      Models: res.models,
      "Query Params": res.queryParams,
      "Request Body": res.requestBody,
      "Response Data": res.responseData,
    };
  }, [documentData, generatorOptions, selectedApi]);

  const handleServiceChange = (url: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("service", url);
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
      return apiGroups.map((group) => group.id);
    });
  }, [apiGroups]);


  return (
    <>
      <Spin spinning={loading}>
        {hasIpParam ? (
          <Layout
            className={"views mx-auto w-full max-w-[1200px] 2xl:max-w-[1400px]"}
            hasSider={true}
          >
            <Sider width={324} style={{background: colorBgContainer}}>
              <SideBar
                scrollRequest={scrollRequest}
                ipValue={inputIp}
                ipOptions={autoCompleteOptions}
                loading={loading}
                onIpChange={setInputIp}
                onIpCommit={handleCommitIp}
                currentServiceUrl={serviceUrl}
                onCurrentServiceUrlChange={handleServiceChange}
                configLoading={configLoading}
                serviceOptions={serviceOptions}
                docLoading={docLoading}
                apis={apiGroups}
                onSelectKeyChange={onMenuSelect}
                onGroupTitleClick={handleGroupTitleClick}
              />
            </Sider>

            <Layout className={"flex flex-col h-full"}>
              <Layout className={"content-wrapper"}>
                <div className="content-api-tabs">
                  {viewedApiKeys.length > 0 ? (
                    <Tabs
                      activeKey={selectedApiKey ?? undefined}
                      onChange={onViewedTabSelect}
                      type="editable-card"
                      hideAdd
                      onEdit={(targetKey, action) => {
                        if (action !== "remove" || typeof targetKey !== "string") return;
                        handleRemoveViewedTab(targetKey);
                      }}
                      items={viewedApiKeys.flatMap((key) => {
                        const api = apiMap.get(key);
                        if (!api) return [];
                        const title = api.operation?.summary ?? api.path;
                        return [{
                          key,
                          label: (
                            <span className="viewed-tab-label" title={title}>
                              {title}
                            </span>
                          ),
                          closable: true,
                        }];
                      })}
                    />
                  ) : (
                    <div className="content-viewed-empty">暂无已查看接口</div>
                  )}
                </div>
                <div className="content-scroll-area">
                  {
                    error && <Empty description={error}/>
                  }
                  {
                    !error && selectedApi && (
                      <Row gutter={[16, 16]} style={{height: "100%"}}>
                        <Col span={12} className={"left-main"}>
                          <ApiInfo api={selectedApi} codeMap={tsCodeParts}/>
                        </Col>

                        <Col span={12} style={{height: "100%"}}>
                          <CodeCard
                            title="Models"
                            code={tsCodeParts?.Models}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              height: "100%",
                            }}
                            styles={{
                              body: {
                                flex: 1,
                                overflow: "auto",
                                padding: 0,
                              },
                            }}
                          ></CodeCard>
                        </Col>
                      </Row>
                    )
                  }
                  {
                    !error && !selectedApi && <Empty description={"请选择 API"}/>
                  }
                </div>
              </Layout>
            </Layout>
          </Layout>
        ) : (
          <div className="home-welcome">
            <div className="home-welcome-card">
              <div className="home-welcome-title">TS Swagger</div>
              <div className="home-welcome-subtitle">
                输入 Swagger/OpenAPI 文档 URL 开始加载
              </div>
              <div className="home-welcome-hint">
                示例：http://localhost:9966/v3/api-docs 或 http://localhost:3000/docs-json
              </div>
              <div className="home-welcome-search">
                <AutoComplete
                  value={inputIp}
                  onChange={(value) => setInputIp(value)}
                  onSelect={handleCommitIp}
                  options={autoCompleteOptions}
                >
                  <Input.Search
                    style={{
                      width: 360,
                    }}
                    size="large"
                    placeholder="输入服务地址或 OpenAPI 文档 URL"
                    loading={loading}
                    enterButton="开始"
                    onSearch={(value) => handleCommitIp(value)}
                  />
                </AutoComplete>
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
