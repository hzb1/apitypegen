import { Empty, Spin } from "antd";
import SideBar, { type SideBarProps } from "@/components/sidebar/SideBar.tsx";
import ApiInfo from "@/components/api-info/ApiInfo.tsx";
import CodeCard from "@/components/code-card/CodeCard.tsx";
import type { ApiDetail } from "../../../../types.ts";
import type { ApiGroup } from "../utils.ts";
import type { LoadingFeedback, ScrollRequest, TsCodeParts } from "../home.types.ts";
import ViewedApiTabs from "./ViewedApiTabs.tsx";

type DocumentWorkspaceProps = {
  error: string | null;
  contentLoading: boolean;
  loadingFeedback: LoadingFeedback;
  scrollRequest?: ScrollRequest;
  apiGroups: ApiGroup[];
  onMenuSelect: (key: string) => void;
  handleGroupTitleClick: (groupItem: SideBarProps["apis"][number]) => void;
  handleToolbarSearchSelect: (key: string) => void;
  orderedViewedApiKeys: string[];
  selectedApiKey: string | null;
  apiMap: Map<string, ApiDetail>;
  pinnedApiKeys: string[];
  onViewedTabSelect: (key: string) => void;
  removeViewedTab: (key: string) => void;
  closeOtherViewedTabs: (key: string) => void;
  togglePinViewedTab: (key: string) => void;
  selectedApi: ApiDetail | null;
  tsCodeParts?: TsCodeParts;
  apiBaseUrl: string;
};

export default function DocumentWorkspace(props: DocumentWorkspaceProps) {
  const {
    error,
    contentLoading,
    loadingFeedback,
    scrollRequest,
    apiGroups,
    onMenuSelect,
    handleGroupTitleClick,
    handleToolbarSearchSelect,
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
    apiBaseUrl,
  } = props;

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
          {error && <Empty description={error} />}
          {!error && !contentLoading && selectedApi && (
            <div className="api-workspace-grid">
              <div className="left-main">
                <ApiInfo api={selectedApi} codeMap={tsCodeParts} apiBaseUrl={apiBaseUrl} />
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
  );
}
