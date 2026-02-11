import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AutoComplete,
  Input,
  Row,
  Col,
  Spin,
  Tag,
  Empty,
  Modal,
  Alert,
  Button,
} from "antd";
import { Layout, theme } from "antd";
import { type AutoCompleteProps } from "antd";
import "./Home.css";
import { useSwagger } from "@/hooks/useSwagger.ts";
import { useOptions } from "@/hooks/useOptions.ts";
import type { OpenAPIV2, OpenAPIV3 } from "openapi-types";
import {
  CheckCircleOutlined,
  LoadingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { usePluginEnabled } from "@/hooks/usePluginEnabled.ts";
import { useSearchParams } from "react-router";
import SideBar, {
  type SideBarProps,
} from "@/components/sidebar/SideBar.tsx";
import ApiInfo from "@/components/api-info/ApiInfo.tsx";
import CodeCard from "@/components/code-card/CodeCard.tsx";
import type { ApiDetail } from "../../../types.ts";
import {getApiSlug, stableHash} from "@/utils/getApiSlug.ts";
import {SwaggerToTS} from "@/utils/SwaggerParser.ts";
import type {ApiGroup} from "./utils.ts";
const { Header, Sider } = Layout;

const SEARCH_HISTORY_KEY = "ts-swagger-search-history";
const MAX_HISTORY = 10;
const EXTENSION_URL =
  (import.meta.env.VITE_PROXY_EXTENSION_URL as string | undefined) ??
  "https://github.com/hzb1/ts-swagger/releases/latest/download/ts-swagger-extension-dist-latest.zip";

type SearchRecord = {
  id: string;
  label: string;
  value: string;
  updatedAt: number;
};

type PathItem = OpenAPIV2.PathItemObject | OpenAPIV3.PathItemObject | OpenAPIV3.ReferenceObject;
type Operation = OpenAPIV2.OperationObject | OpenAPIV3.OperationObject;

const Home: React.FC = () => {
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const [searchParams, setSearchParams] = useSearchParams();

  const ipFromUrl = searchParams.get("ip")?.trim() ?? "";
  const serviceUrl = searchParams.get("service") ?? undefined;
  const selectedApiKey = searchParams.get("api");
  const hasIpParam = Boolean(ipFromUrl);

  // const queryApiKey = searchParams.get("api");

  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '');
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

  const { documentData, configData, stage, error } = useSwagger({
    ip: ipFromUrl,
    serviceUrl,
    options: {
      // 当 Hook 发现配置加载好了但 URL 没 service 时触发
      onAutoSelectService: (defaultUrl) => {
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.set("service", defaultUrl);
          return next;
        }, { replace: true });
      },
      onDocumentLoaded: (doc) => {
        if (doc.paths) {
          const allTags = new Set<string>();
          Object.values(doc.paths).forEach((pathItem) => {
            const item = pathItem as PathItem;
            if (!item || typeof item !== "object" || "$ref" in item) return;
            ["get", "post", "put", "delete", "patch"].forEach(method => {
              const op = (item as Record<string, Operation | undefined>)[method];
              if (op?.tags?.[0]) {
                // 注意：这里的 ID 生成逻辑应与 apiGroups 保持一致
                // 如果你的 SideBar 使用的是 stableHash(tag)，则存入 hash
                allTags.add(stableHash(op.tags[0]));
              }
            });
          });
          setExpandedGroupList(Array.from(allTags));
        }
      }
    }
  });

  const configLoading = stage === 'config';
  const docLoading = stage === 'document';

  const loading = configLoading || docLoading;

  const filteredGroupedApis = useMemo(() => {
    // 这里的 documentData 来自 useSwagger()
    if (!documentData?.paths) return {};

    const query = searchQuery.trim().toLowerCase();
    const groups: Record<string, ApiDetail[]> = {};

    for (const [path, item] of Object.entries(documentData.paths)) {
      // 遍历所有 HTTP 方法
      for (const method of ["get", "post", "put", "delete", "patch"] as const) {
        const op = (item)[method];
        if (!op) continue;

        let matchType = "";
        // 匹配逻辑：路径、摘要或 OperationId
        if (path.toLowerCase().includes(query)) matchType = "路径";
        else if (op.summary?.toLowerCase().includes(query)) matchType = "名称";
        else if (op.operationId?.toLowerCase().includes(query)) matchType = "ID";
        else if (query !== "") continue; // 如果有搜索词但不匹配则跳过

        const tag = op.tags?.[0] ?? "Default";
        (groups[tag] ||= []).push({
          key: getApiSlug({ path, method, operation: op }),
          path,
          method,
          matchType,
          operation: op,
        });
      }
    }

    return groups;
  }, [documentData, searchQuery]);

  // 2. 调用配置持久化逻辑
  const { generatorOptions } = useOptions();

  const selectedApi = useMemo(() => {
    if (!selectedApiKey) return null;
    const apiList = Object.entries(filteredGroupedApis).map(
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
  }, [filteredGroupedApis, selectedApiKey]);

  // 展开的分组
  const [expandedGroupList, setExpandedGroupList] = useState<string[]>(() => {
    const api = searchParams.get("api");
    if (!api) return [];
    return [];
  });

  const handleGroupTitleClick = (groupItem: ApiGroup) => {
    const groupId = groupItem.id;
    setExpandedGroupList((prev) => {
      if (prev.includes(groupId)) {
        return prev.filter((id) => id !== groupId);
      } else {
        return [...prev, groupId];
      }
    });
  };

  const { pluginEnabled, checking } = usePluginEnabled();

  const handleCommitIp = (nextIp: string) => {
    setInputIp(nextIp);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("ip", nextIp);
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
        item.id === renameTarget.id ? { ...item, label: nextLabel } : item,
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
      })),
    [searchHistory, handleDelete, handleRename],
  );

  const autoCompleteOptions = useMemo(() => {
    const groups: AutoCompleteProps['options'] = [];
    if (historyOptions.length) {
      groups.push({ label: "搜索记录", options: historyOptions, key: "history-group" });
    }
    return groups;
  }, [historyOptions]);

  /**
   * 菜单选择回调
   */
  const onMenuSelect = (key: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("api", key);
      return next;
    });
  };

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
    return Object.entries(filteredGroupedApis).map(([tag, apis]) => {
      const id = stableHash(tag);
      const isExpanded = expandedGroupList.includes(id);

      const children = apis.map((api) => ({
        ...api,
        isSelected: Boolean(selectedApiKey) && api.key === selectedApiKey,
      }));

      return {
        id,
        isExpanded,
        children,
        name: tag,
      };
    });
  }, [filteredGroupedApis, expandedGroupList, selectedApiKey]);

  /**
   * 在初始化时 设置默认展开的分组
   */
  // if (expandedGroupList.length === 0 && queryApiKey && apiGroups) {
  //   // 找出当前接口所在的分组
  //   const currentGroup = apiGroups.find((group) =>
  //     group.children.some((api) => api.key === queryApiKey),
  //   );
  //   if (currentGroup) {
  //     setExpandedGroupList([currentGroup.id]);
  //   }
  // }

  return (
    <>
      <Spin spinning={loading}>
        {hasIpParam ? (
          <Layout className={"views"} hasSider={true}>
            <Sider width={324} style={{ background: colorBgContainer }}>
              <SideBar
                currentServiceUrl={serviceUrl}
                onCurrentServiceUrlChange={handleServiceChange}
                configLoading={configLoading}
                serviceOptions={serviceOptions}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                docLoading={docLoading}
                apis={apiGroups}
                onSelectKeyChange={onMenuSelect}
                onGroupTitleClick={handleGroupTitleClick}
              />
            </Sider>

            <Layout className={"flex flex-col h-full"}>
              <Header
                className={"header-wrapper border-b border-gray-950/5"}
                style={{
                  display: "flex",
                  alignItems: "justify-content-between",
                  backgroundColor: colorBgContainer,
                }}
              >
                <div className={"search-wrapper"}>
                  <AutoComplete
                    value={inputIp}
                    onChange={(value) => setInputIp(value)}
                    onSelect={handleCommitIp}
                    options={autoCompleteOptions}
                    style={{ width: 304 }}
                  >
                    <Input.Search
                      placeholder="输入 IP 地址"
                      enterButton
                      loading={loading}
                      onSearch={(value) => handleCommitIp(value)}
                    />
                  </AutoComplete>
                </div>

                <div>
                  {checking ? (
                    <Tag
                      color="success"
                      variant={"solid"}
                      icon={<LoadingOutlined />}
                    >
                      检查中
                    </Tag>
                  ) : pluginEnabled ? (
                    <Tag
                      color="success"
                      variant={"solid"}
                      icon={<CheckCircleOutlined />}
                    >
                      已连接
                    </Tag>
                  ) : (
                    <Tag
                      color="error"
                      variant={"solid"}
                      icon={<WarningOutlined />}
                    >
                      未连接
                    </Tag>
                  )}
                </div>
              </Header>
              <Layout className={"content-wrapper overflow-y-auto"}>
                {error && <span>{error}</span>}
                {selectedApi ? (
                  <Row gutter={[16, 16]} style={{ height: "100%" }}>
                    <Col span={12} className={"left-main"}>
                      <ApiInfo api={selectedApi} codeMap={tsCodeParts} />
                    </Col>

                    <Col span={12} style={{ height: "100%" }}>
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
                ) : (
                  <Empty description={"请选择 API"} />
                )}
              </Layout>
            </Layout>
          </Layout>
        ) : (
          <div className="home-welcome">
            <div className="home-welcome-card">
              <div className="home-welcome-title">TS Swagger</div>
              <div className="home-welcome-subtitle">
                输入 IP 地址开始加载 Swagger 文档
              </div>
              <div className="home-welcome-hint">
                示例：127.0.0.1:9966 或 http://localhost:9966
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
                    placeholder="输入 IP 地址"
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
