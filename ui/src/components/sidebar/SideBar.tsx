import "./SideBar.css";
import { Empty } from "antd";
import ApiList, { type ApiListProps } from "../ApiList/ApiList.tsx";
import React, { useEffect, useRef, useState } from "react";
import logoUrl from "@/assets/logo/logo-replica-full.svg";
import ApiSearchDialog from "@/components/sidebar/ApiSearchDialog.tsx";
// import logoUrl from "@/assets/logo/logo-replica.svg";

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
    <div
      className={
        "sidebar hidden lg:flex flex-col left-0 top-0 bottom-0 border-r border-gray-200/70 dark:border-white/[0.07] h-full"
      }
    >
      <div className={"h-full flex flex-col flex-1 stable-scrollbar-gutter"}>
        <div className={"px-4 pt-4 pb-4"}>
          <a className={"logo cursor-pointer"}>
            <img src={logoUrl} alt="TS Swagger" title={'TS Swagger'} className="logo-img" />
          </a>
          <div className={"mt-3"}>
            <ApiSearchDialog
              apis={apis}
              onSelectResult={onSearchSelectResult}
            />
          </div>
        </div>

        <div
          className={"flex-1 overflow-y-auto flex flex-col pl-4 pr-2 sidebar-api-scroll"}
          ref={apiListScrollRef}
        >
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
