import { Alert, Button, Empty, Space, Spin } from "antd";
import { useState } from "react";
import { ApiOutlined, CodeOutlined, DatabaseOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import SideBar, { type SideBarProps } from "@/components/sidebar/SideBar.tsx";
import ApiInfo from "@/components/api-info/ApiInfo.tsx";
import CodeCard from "@/components/code-card/CodeCard.tsx";
import ResponseTabs from "@/components/api-info/ResponseTabs.tsx";
import type { SwaggerErrorDetail } from "@/hooks/useSwagger.ts";
import type { ApiDetail } from "../../../../types.ts";
import type { ApiGroup } from "../utils.ts";
import type { LoadingFeedback, ScrollRequest, TsCodeParts } from "../home.types.ts";
import { EXTENSION_URL } from "../home.constants.ts";
import ViewedApiTabs from "./ViewedApiTabs.tsx";
import type { AllServiceSearchGroup, SearchResultSelectContext } from "@/components/sidebar/ApiSearchDialog.tsx";
import type { TypeScriptSyntaxDiagnostic } from "../../../../../cli/src/core/typescript-validation.ts";

/** 文档工作台的展示与操作输入。 */
type DocumentWorkspaceProps = {
  /** 文档加载失败时的用户提示。 */
  error: string | null;
  /** 文档加载失败的结构化详情。 */
  errorDetail?: SwaggerErrorDetail | null;
  /** 文档或接口内容是否正在加载。 */
  contentLoading: boolean;
  /** 当前加载阶段的展示文案。 */
  loadingFeedback: LoadingFeedback;
  /** 需要侧边栏执行的滚动定位请求。 */
  scrollRequest?: ScrollRequest;
  /** 当前文档按标签整理的接口分组。 */
  apiGroups: ApiGroup[];
  /** 用户从接口导航选择接口时的回调。 */
  onMenuSelect: (key: string) => void;
  /** 用户切换接口分组展开状态时的回调。 */
  handleGroupTitleClick: (groupItem: SideBarProps["apis"][number]) => void;
  /** 用户从搜索结果选择接口时的回调。 */
  handleToolbarSearchSelect: (key: string, context?: SearchResultSelectContext) => void;
  /** 当前服务的展示名称。 */
  currentServiceLabel?: string;
  /** 跨服务搜索可以使用的接口分组。 */
  allServiceGroups?: AllServiceSearchGroup[];
  /** 按需加载跨服务接口分组的回调。 */
  loadAllServiceGroups?: () => Promise<AllServiceSearchGroup[]>;
  /** 是否允许执行跨服务搜索。 */
  allServiceSearchEnabled?: boolean;
  /** 跨服务接口仍在加载时的提示。 */
  allServiceLoadingText?: string;
  /** 跨服务接口加载失败时的提示。 */
  allServiceError?: string;
  /** 已查看接口按展示顺序排列的标识。 */
  orderedViewedApiKeys: string[];
  /** 当前选中接口的标识。 */
  selectedApiKey: string | null;
  /** 接口标识到接口详情的索引。 */
  apiMap: Map<string, ApiDetail>;
  /** 已固定在查看栏中的接口标识。 */
  pinnedApiKeys: string[];
  /** 用户切换已查看接口时的回调。 */
  onViewedTabSelect: (key: string) => void;
  /** 用户关闭已查看接口时的回调。 */
  removeViewedTab: (key: string) => void;
  /** 用户关闭其他已查看接口时的回调。 */
  closeOtherViewedTabs: (key: string) => void;
  /** 用户切换接口固定状态时的回调。 */
  togglePinViewedTab: (key: string) => void;
  /** 当前选中的接口详情。 */
  selectedApi: ApiDetail | null;
  /** 当前接口按区域拆分的生成代码。 */
  tsCodeParts?: TsCodeParts;
  /** 当前生成代码中发现的 TypeScript 语法诊断。 */
  syntaxDiagnostics: TypeScriptSyntaxDiagnostic[];
  /** 当前接口请求地址使用的基础 URL。 */
  apiBaseUrl: string;
  /** 没有选中接口时显示的文档概览。 */
  dashboard?: ReactNode;
  /** 浏览器扩展是否正在重新检测。 */
  extensionChecking?: boolean;
  /** 重新检测浏览器扩展的回调。 */
  onRecheckExtension?: () => void;
  /** 打开示例文档的回调。 */
  onTryDemo?: () => void;
  /** 返回首页欢迎视图的回调。 */
  onBackHome?: () => void;
};

/** 当前接口的响应选择；切换接口时不沿用旧状态。 */
type ResponseSelection = {
  /** 选择操作发生时的接口，用于隔离不同接口或文档的状态。 */
  api: ApiDetail | null;
  /** 状态码；all 表示全部响应。 */
  status: string;
};

export default function DocumentWorkspace(props: DocumentWorkspaceProps) {
  const {
    error,
    errorDetail,
    contentLoading,
    loadingFeedback,
    scrollRequest,
    apiGroups,
    onMenuSelect,
    handleGroupTitleClick,
    handleToolbarSearchSelect,
    currentServiceLabel,
    allServiceGroups,
    loadAllServiceGroups,
    allServiceSearchEnabled,
    allServiceLoadingText,
    allServiceError,
    orderedViewedApiKeys,
    selectedApiKey,
    apiMap,
    pinnedApiKeys,
    onViewedTabSelect,
    removeViewedTab,
    closeOtherViewedTabs,
    togglePinViewedTab,
    selectedApi,
    tsCodeParts,
    syntaxDiagnostics,
    apiBaseUrl,
    dashboard,
    extensionChecking,
    onRecheckExtension,
    onTryDemo,
    onBackHome,
  } = props;
  const [responseSelection, setResponseSelection] = useState<ResponseSelection>({ api: null, status: "all" });
  const [dismissedSyntaxFingerprint, setDismissedSyntaxFingerprint] = useState<string | null>(null);
  const selectedResponse = responseSelection.api === selectedApi
    && tsCodeParts?.Responses?.some((response) => response.status === responseSelection.status)
    ? responseSelection.status
    : "all";
  const handleResponseChange = (status: string) => {
    setResponseSelection({ api: selectedApi, status });
  };
  const modelsCode = selectedResponse === "all"
    ? tsCodeParts?.Models
    : tsCodeParts?.Responses?.find((response) => response.status === selectedResponse)?.models;
  const syntaxFingerprint = syntaxDiagnostics
    .map((item) => `${item.code}:${item.area}:${item.responseStatus ?? "none"}:${item.line}:${item.column}`)
    .join("|");
  const visibleSyntaxDiagnostics = syntaxDiagnostics.slice(0, 5);
  const shouldShowSyntaxAlert = syntaxDiagnostics.length > 0
    && dismissedSyntaxFingerprint !== syntaxFingerprint;
  const apiCount = apiGroups.reduce((total, group) => total + group.children.length, 0);

  return (
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
          currentServiceLabel={currentServiceLabel}
          allServiceGroups={allServiceGroups}
          loadAllServiceGroups={loadAllServiceGroups}
          allServiceSearchEnabled={allServiceSearchEnabled}
          allServiceLoadingText={allServiceLoadingText}
          allServiceError={allServiceError}
        />
      </aside>

      <main className="content-wrapper">
        <ViewedApiTabs
          orderedViewedApiKeys={orderedViewedApiKeys}
          selectedApiKey={selectedApiKey}
          apiMap={apiMap}
          pinnedApiKeys={pinnedApiKeys}
          onViewedTabSelect={onViewedTabSelect}
          removeViewedTab={removeViewedTab}
          closeOtherViewedTabs={closeOtherViewedTabs}
          togglePinViewedTab={togglePinViewedTab}
        />

        <div className="content-scroll-area">
          {error && (
            <div className="document-error-state">
              <Alert
                type={errorDetail?.requiresExtension ? "warning" : "error"}
                showIcon
                message={errorDetail?.message || error}
                description={
                  <div className="document-error-description">
                    {errorDetail?.reason ? <p>{errorDetail.reason}</p> : null}
                    {errorDetail?.tips?.length ? (
                      <ul>
                        {errorDetail.tips.map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="可以检查文档地址后重试" />
                    )}
                  </div>
                }
                action={
                  <Space wrap>
                    {errorDetail?.requiresExtension ? (
                      <>
                        <Button size="small" type="primary" href={EXTENSION_URL}>
                          下载扩展
                        </Button>
                        <Button size="small" loading={extensionChecking} onClick={onRecheckExtension}>
                          重新检测
                        </Button>
                      </>
                    ) : null}
                    <Button size="small" onClick={onTryDemo}>
                      试用示例项目
                    </Button>
                    <Button size="small" onClick={onBackHome}>
                      返回首页
                    </Button>
                  </Space>
                }
              />
            </div>
          )}
          {!error && !contentLoading && selectedApi && (
            <>
              {shouldShowSyntaxAlert ? (
                <Alert
                  className="typescript-syntax-alert"
                  type="error"
                  showIcon
                  closable
                  onClose={() => setDismissedSyntaxFingerprint(syntaxFingerprint)}
                  message="生成的 TypeScript 未通过语法校验"
                  description={`${visibleSyntaxDiagnostics
                    .map((item) => `TS${item.code} · ${item.area}${item.responseStatus ? `:${item.responseStatus}` : ""} · 第 ${item.line} 行，第 ${item.column} 列`)
                    .join("；")}${syntaxDiagnostics.length > visibleSyntaxDiagnostics.length
                    ? `；另有 ${syntaxDiagnostics.length - visibleSyntaxDiagnostics.length} 条诊断`
                    : ""}`}
                />
              ) : null}
              <div className="api-workspace-grid">
                <div className="left-main">
                  <ApiInfo
                    api={selectedApi}
                    codeMap={tsCodeParts}
                    apiBaseUrl={apiBaseUrl}
                    selectedResponse={selectedResponse}
                    onResponseChange={handleResponseChange}
                  />
                </div>
                <div className="models-panel">
                  {tsCodeParts?.Responses?.length ? (
                    <ResponseTabs
                      responses={tsCodeParts.Responses}
                      value={selectedResponse}
                      onChange={handleResponseChange}
                      label="Models 响应状态选择"
                    />
                  ) : null}
                  <CodeCard
                    title={selectedResponse === "all" ? "Models · 全部响应" : `Models · ${selectedResponse}`}
                    code={modelsCode || "// 当前请求与响应无需引用模型"}
                  />
                </div>
              </div>
            </>
          )}
          {!error && !contentLoading && !selectedApi && dashboard}
          {!error && !contentLoading && !selectedApi && !dashboard && (
            <div className="content-center-status workspace-empty-state">
              <div className="workspace-empty-visual">
                <div className="workspace-empty-column">
                  <div className="workspace-empty-kicker">
                    <ApiOutlined />
                    <span>{apiCount} APIs</span>
                  </div>
                  <strong>接口导航</strong>
                  <span>按分组定位 API</span>
                </div>
                <div className="workspace-empty-column is-primary">
                  <div className="workspace-empty-kicker">
                    <CodeOutlined />
                    <span>TypeScript</span>
                  </div>
                  <strong>详情与类型</strong>
                  <span>查看参数、请求体和响应模型</span>
                </div>
                <div className="workspace-empty-column">
                  <div className="workspace-empty-kicker">
                    <DatabaseOutlined />
                    <span>Local</span>
                  </div>
                  <strong>本地接口库</strong>
                  <span>保存或导出当前文档</span>
                </div>
              </div>
              <Empty description="选择左侧 API，开始查看文档与类型模型" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
