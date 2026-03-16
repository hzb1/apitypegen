import "./SideBar.css";
import { Empty } from "antd";
import ApiList, { type ApiListProps } from "../ApiList/ApiList.tsx";
import React, { useEffect, useRef, useState } from "react";
import ApiSearchDialog from "@/components/sidebar/ApiSearchDialog.tsx";

type ScrollRequest = {
  key: string;
  id: number;
};

export type SideBarProps = {
  scrollRequest?: ScrollRequest;
  onSearchSelectResult?: (selectedKey: string) => void;
} & ApiListProps;

const SideBar: React.FC<SideBarProps> = (props) => {
  const {
    scrollRequest,
    apis,
    onSelectKeyChange,
    onGroupTitleClick,
    onSearchSelectResult,
  } = props;

  const handleGroupTitleClick = (groupItem: ApiListProps["apis"][number]) => {
    onGroupTitleClick?.(groupItem);
  };

  const apiListScrollRef = useRef<HTMLDivElement>(null);
  const [pendingScrollKey, setPendingScrollKey] = useState<string | null>(null);

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
  }, [apis, pendingScrollKey]);

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
            />
          </div>
        </div>

        <div className="sidebar-api-scroll" ref={apiListScrollRef}>
          {apis?.length ? (
            <ApiList
              apis={apis}
              onSelectKeyChange={onSelectKeyChange}
              onGroupTitleClick={handleGroupTitleClick}
              scrollContainerRef={apiListScrollRef}
            />
          ) : (
            <Empty description={"暂无 API 接口"} />
          )}
        </div>
      </div>
    </div>
  );
};

export default SideBar;
