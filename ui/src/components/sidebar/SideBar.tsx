import "./SideBar.css";
import { Empty, Select } from "antd";
import ApiList, { type ApiListProps } from "../ApiList/ApiList.tsx";
import React, { useEffect, useRef, useState } from "react";
import ApiSearchDialog from "./ApiSearchDialog.tsx";

type Option = {
  label: string;
  value: string;
};

export type SideBarProps = {
  currentServiceUrl?: string;
  onCurrentServiceUrlChange: (url: string) => void;
  configLoading?: boolean;
  serviceOptions: Option[];
  docLoading?: boolean;
} & ApiListProps;

const SideBar: React.FC<SideBarProps> = (props) => {
  const {
    currentServiceUrl,
    onCurrentServiceUrlChange,
    configLoading,
    serviceOptions,
    apis,
    onSelectKeyChange,
    onGroupTitleClick,
  } = props;

  const handleServiceChange = (url: string) => {
    onCurrentServiceUrlChange(url);
  };

  const handleGroupTitleClick = (groupItem: ApiListProps['apis'][number]) => {
    onGroupTitleClick?.(groupItem);
  };

  const apiListScrollRef = useRef<HTMLDivElement>(null);
  const [pendingScrollKey, setPendingScrollKey] = useState<string | null>(null);

  const handleSearchSelect = (selectedKey: string) => {
    const targetGroup = apis.find((group) =>
      group.children.some((item) => item.key === selectedKey),
    );
    if (targetGroup && !targetGroup.isExpanded) {
      onGroupTitleClick?.(targetGroup);
    }
    onSelectKeyChange?.(selectedKey);
    setPendingScrollKey(selectedKey);
  };

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
      <div
        className={
          "h-full flex flex-col flex-1 stable-scrollbar-gutter"
        }
      >
        <div className={"flex justify-between items-center px-4 pt-4"}>
          <a href="/" className={"logo"}>
            Logo
          </a>
        </div>

        <div className={"flex flex-col gap-4 mt-4 px-4 pb-4"}>
          <Select
            value={currentServiceUrl}
            loading={configLoading}
            onChange={handleServiceChange}
            options={serviceOptions}
            placeholder={"选择服务"}
            size={'large'}
          />

          <ApiSearchDialog apis={apis} onSelectResult={handleSearchSelect} />
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
