import "./SideBar.css";
import { Empty, Select } from "antd";
import SearchBar from "../ui/SearchBar/SearchBar.tsx";
import ApiList, { type ApiListProps } from "../ApiList/ApiList.tsx";
import React, { useRef } from "react";

type Option = {
  label: string;
  value: string;
};

export type SideBarProps = {
  currentServiceUrl?: string;
  onCurrentServiceUrlChange: (url: string) => void;
  configLoading?: boolean;
  serviceOptions: Option[];
  searchQuery?: string;
  setSearchQuery: (query: string) => void;
  docLoading?: boolean;
} & ApiListProps;

const SideBar: React.FC<SideBarProps> = (props) => {
  const {
    currentServiceUrl,
    onCurrentServiceUrlChange,
    configLoading,
    serviceOptions,
    searchQuery,
    setSearchQuery,
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
          />

          <div
            className={
              "relative hidden lg:flex items-center flex-1 z-20 justify-center"
            }
          >
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
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
