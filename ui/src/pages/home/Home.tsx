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
import "./Home.css";
import {useSwagger} from "@/hooks/useSwagger.ts";
import {useOptions} from "@/hooks/useOptions.ts";
import {DownloadOutlined, MenuOutlined, PushpinOutlined, QuestionCircleOutlined, SettingOutlined} from "@ant-design/icons";
import {usePluginEnabled} from "@/hooks/usePluginEnabled.ts";
import {useSearchParams} from "react-router";
import SideBar, {
  type SideBarProps,
} from "@/components/sidebar/SideBar.tsx";
import ApiInfo from "@/components/api-info/ApiInfo.tsx";
import CodeCard from "@/components/code-card/CodeCard.tsx";
import ThemeDropdown from "@/components/theme/ThemeDropdown.tsx";
import {useApiNavigationData} from "@/hooks/useApiNavigationData.ts";
import {useViewedApiTabs} from "@/hooks/useViewedApiTabs.ts";
import {useDocSearchHistory} from "@/hooks/useDocSearchHistory.tsx";
import logoUrl from "@/assets/logo/logo-replica-full.svg";

const EXTENSION_URL =
  (import.meta.env.VITE_PROXY_EXTENSION_URL as string | undefined) ??
  "https://swagger.huzhibin.top/downloads/ts-swagger-extension-dist-latest.zip";
const DEFAULT_DOC_URL = "https://api.huzhibin.top/docs/json";

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

  const [inputIp, setInputIp] = useState(ipFromUrl || DEFAULT_DOC_URL);
  const [reloadKey, setReloadKey] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false);
  const scrollRequestIdRef = useRef(0);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | undefined>(undefined);
  const {
    autoCompleteOptions,
    renameTarget,
    renameValue,
    setRenameTarget,
    setRenameValue,
    confirmRename,
    recordSearchOnce,
  } = useDocSearchHistory();

  const {documentData, configData, stage, error} = useSwagger({
    docOrHost: ipFromUrl,
    ip: ipFromUrl,
    serviceUrl,
    reloadKey,
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
  const probeLoading = stage === 'probe';

  const loading = probeLoading || configLoading || docLoading;

  // 2. 调用配置持久化逻辑
  const {configState, setConfigState, generatorOptions} = useOptions();

  const [expandedGroupList, setExpandedGroupList] = useState<string[]>([]);
  const {selectedApi, apiMap, apiKeyToGroupId, apiGroups} = useApiNavigationData({
    documentData,
    selectedApiKey,
    expandedGroupList,
  });

  const handleGroupTitleClick = (groupItem: SideBarProps["apis"][number]) => {
    const groupId = groupItem.id;
    setExpandedGroupList((prev) => {
      if (prev.includes(groupId)) {
        return prev.filter((id) => id !== groupId);
      }
      return [...prev, groupId];
    });
  };

  const {pluginEnabled, checking} = usePluginEnabled();
  const viewedContextKey = useMemo(
    () => `${ipFromUrl}__${serviceUrl ?? ""}`,
    [ipFromUrl, serviceUrl],
  );
  const handleSelectApi = useCallback((nextApiKey?: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextApiKey) {
        next.set("api", nextApiKey);
      } else {
        next.delete("api");
      }
      return next;
    });
  }, [setSearchParams]);
  const {
    pinnedApiKeys,
    orderedViewedApiKeys,
    removeViewedTab,
    closeOtherViewedTabs,
    togglePinViewedTab,
  } = useViewedApiTabs({
    viewedContextKey,
    selectedApiKey,
    apiMap,
    onSelectApi: handleSelectApi,
  });

  const handleCommitIp = (nextIp: string) => {
    const normalized = nextIp.trim();
    if (!normalized) return;
    setInputIp(normalized);
    setReloadKey((current) => current + 1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("doc", normalized);
      next.delete("ip");
      next.delete("api"); // 切换 IP 时建议清除旧的 API 选中态
      next.delete("service"); // 切换 IP 时也清除旧的服务，触发 Hook 的自动补全
      return next;
    });
  };

  useEffect(() => {
    setInputIp(ipFromUrl || DEFAULT_DOC_URL);
  }, [ipFromUrl]);

  useEffect(() => {
    if (!documentData) return;
    recordSearchOnce(ipFromUrl);
  }, [documentData, ipFromUrl, recordSearchOnce]);

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

  const contentLoading = hasIpParam && !error && (loading || !documentData);
  const loadingFeedback = useMemo(() => {
    if (probeLoading) {
      return {
        title: "正在加载文档",
        button: "检查地址...",
        text: "正在请求文档地址，识别 OpenAPI / Swagger 数据",
      };
    }
    if (configLoading) {
      return {
        title: "正在加载文档",
        button: "探测配置...",
        text: "正在探测 swagger-config 和可用服务列表",
      };
    }
    if (docLoading) {
      return {
        title: "正在加载文档",
        button: "读取文档...",
        text: "正在请求 OpenAPI 文档并解析接口定义",
      };
    }
    return {
      title: "正在准备文档",
      button: "加载文档",
      text: "正在准备文档请求",
    };
  }, [configLoading, docLoading, probeLoading]);

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
                          {loading ? loadingFeedback.button : "加载文档"}
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
                          minWidth: '160px'
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
              {!error && contentLoading && (
                <div className="home-main-loading" role="status" aria-live="polite">
                  <div className="home-main-loading-panel">
                    <Spin size="large" />
                    <div className="home-main-loading-title">{loadingFeedback.title}</div>
                    <div className="home-main-loading-copy">{loadingFeedback.text}</div>
                  </div>
                </div>
              )}
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
                        removeViewedTab(targetKey);
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
                                    togglePinViewedTab(key);
                                    return;
                                  }
                                  if (actionKey === "close-others") {
                                    closeOtherViewedTabs(key);
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
                  {!error && !contentLoading && selectedApi && (
                    <div className="api-workspace-grid">
                      <div className="left-main">
                        <ApiInfo api={selectedApi} codeMap={tsCodeParts} apiBaseUrl={apiBaseUrl}/>
                      </div>
                      <div className="models-panel">
                        <CodeCard title="Models" code={tsCodeParts?.Models} />
                      </div>
                    </div>
                  )}
                  {!error && !contentLoading && !selectedApi && (
                    <div className="content-center-status">
                      <Empty description="请选择左侧 API，开始查看文档与类型模型" />
                    </div>
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
                      placeholder={DEFAULT_DOC_URL}
                      onPressEnter={(event) => handleCommitIp(event.currentTarget.value)}
                    />
                  </AutoComplete>
                  <button
                    type="button"
                    className="welcome-load-button"
                    onClick={() => handleCommitIp(inputIp)}
                    disabled={!inputIp.trim() || loading}
                  >
                    {loading ? loadingFeedback.button : "开始探索"}
                  </button>
                </div>
              </div>
              <Button
                className="home-welcome-download"
                type="link"
                icon={<DownloadOutlined />}
                href={EXTENSION_URL}
              >
                下载最新浏览器扩展
              </Button>
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
                    下载最新扩展
                  </Button>
                }
                className="home-welcome-alert"
              />
            )}
          </div>
        )}
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
