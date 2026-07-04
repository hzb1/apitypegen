import "./SideBar.css";
import { Empty } from "antd";
import ApiList, { type ApiListProps } from "../ApiList/ApiList.tsx";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ApiSearchDialog from "@/components/sidebar/ApiSearchDialog.tsx";
import SidebarFilter from "./SidebarFilter.tsx";
import type { AllServiceSearchGroup, SearchResultSelectContext } from "./ApiSearchDialog.tsx";

type ScrollRequest = {
  key: string;
  id: number;
};

export type SideBarProps = {
  scrollRequest?: ScrollRequest;
  currentServiceLabel?: string;
  allServiceGroups?: AllServiceSearchGroup[];
  loadAllServiceGroups?: () => Promise<AllServiceSearchGroup[]>;
  allServiceSearchEnabled?: boolean;
  allServiceLoadingText?: string;
  allServiceError?: string;
  onSearchSelectResult?: (selectedKey: string, context?: SearchResultSelectContext) => void;
} & ApiListProps;

const SideBar: React.FC<SideBarProps> = (props) => {
  const {
    scrollRequest,
    apis,
    onSelectKeyChange,
    onGroupTitleClick,
    onSearchSelectResult,
    currentServiceLabel,
    allServiceGroups,
    loadAllServiceGroups,
    allServiceSearchEnabled,
    allServiceLoadingText,
    allServiceError,
  } = props;

  const handleGroupTitleClick = (groupItem: ApiListProps["apis"][number]) => {
    onGroupTitleClick?.(groupItem);
  };

  const apiListScrollRef = useRef<HTMLDivElement>(null);
  const [pendingScrollKey, setPendingScrollKey] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const filteredApis = useMemo(() => {
    const query = filterValue.trim().toLowerCase();
    if (!query) return apis;
    return apis.flatMap((group) => {
      const children = group.children.filter((item) => {
        const summary = item.operation?.summary?.toLowerCase() ?? "";
        const operationId = item.operation?.operationId?.toLowerCase() ?? "";
        return item.path.toLowerCase().includes(query)
          || item.method.toLowerCase().includes(query)
          || summary.includes(query)
          || operationId.includes(query);
      });
      if (!children.length) return [];
      return [{
        ...group,
        isExpanded: true,
        children,
      }];
    });
  }, [apis, filterValue]);

  useEffect(() => {
    if (!scrollRequest?.key) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingScrollKey(scrollRequest.key);
  }, [scrollRequest]);

  useEffect(() => {
    if (!pendingScrollKey) return;
    const container = apiListScrollRef.current;
    if (!container) return;

    const escaped =
      typeof CSS !== "undefined" && "escape" in CSS
        ? CSS.escape(pendingScrollKey)
        : pendingScrollKey.replace(/["\\]/g, "\\$&");
    const selector = `[data-api-key="${escaped}"]`;

    let rafId = 0;
    const tryScroll = (attempt: number) => {
      const target = container.querySelector(selector) as HTMLElement | null;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setPendingScrollKey(null);
        return;
      }
      if (attempt >= 20) {
        setPendingScrollKey(null);
        return;
      }
      rafId = requestAnimationFrame(() => tryScroll(attempt + 1));
    };

    tryScroll(0);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [filteredApis, pendingScrollKey]);

  return (
    <div className="sidebar">
      <div className="sidebar-shell">
        <div className="sidebar-header">
          <p className="sidebar-title">接口导航</p>
          <div className="sidebar-search">
            <ApiSearchDialog
              apis={apis}
              onSelectResult={onSearchSelectResult}
              triggerClassName="sidebar-search-trigger"
              currentServiceLabel={currentServiceLabel}
              allServiceGroups={allServiceGroups}
              loadAllServiceGroups={loadAllServiceGroups}
              allServiceSearchEnabled={allServiceSearchEnabled}
              allServiceLoadingText={allServiceLoadingText}
              allServiceError={allServiceError}
            />
          </div>
          <div className="sidebar-filter">
            <SidebarFilter value={filterValue} onChange={setFilterValue} />
          </div>
        </div>

        <div className="sidebar-api-scroll" ref={apiListScrollRef}>
          {filteredApis?.length ? (
            <ApiList
              apis={filteredApis}
              onSelectKeyChange={onSelectKeyChange}
              onGroupTitleClick={handleGroupTitleClick}
              scrollContainerRef={apiListScrollRef}
            />
          ) : (
            <Empty description={filterValue.trim() ? "暂无匹配接口" : "暂无 API 接口"} />
          )}
        </div>
      </div>
    </div>
  );
};

export default SideBar;
