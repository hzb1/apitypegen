import "./ApiList.css";
import type { ApiDetail } from "../../../types.ts";
import ApiItem from "./ApiItem.tsx";
import React from "react";
import { RightOutlined } from "@ant-design/icons";

export type ApiGroup = {
  id: string;
  name: string;
  children: ApiItem[];
  // 是否展开
  isExpanded: boolean;
};

type ApiItem = ApiDetail & {
  // 是否选中
  isSelected: boolean;
};

export type ApiListProps = {
  apis: ApiGroup[];
  onSelectKeyChange?: (selectedKey: string) => void;
  // 当前展开的分组索引发生变化时的回调
  // onExpandChange: (expanded: string[]) => void;
  // 点击分组标题时触发
  onGroupTitleClick?: (groupItem: ApiGroup) => void;
};

const ApiList: React.FC<ApiListProps> = ({
  apis,
  onSelectKeyChange,
   onGroupTitleClick,
}) => {

  const handleGroupTitleClick = (groupItem: ApiGroup) => {
    onGroupTitleClick?.(groupItem);
  };

  return (
    <>
      {apis.map((groupItem) => {
        const groupName = groupItem.children.length
          ? `${groupItem.name}`
          : groupItem.name;

        // 数量
        const num = groupItem.children?.length ? ` (${groupItem.children.length})` : ''

        // 是否展开
        const isExpanded = groupItem.isExpanded;

        return (
          <div className={"api-list-wrapper"} key={groupItem.id}>
            <div
              className={
                "flex items-center justify-between gap-2.5 h-7 mb-1 text-gray-900 dark:text-gray-200 font-medium sticky " +
                "top-0 z-10 bg-white cursor-pointer"
              }
              onClick={() => handleGroupTitleClick(groupItem)}
            >
              <div className="flex items-baseline">
                <h5 className={'text-gray-600 font-medium text-sm'}>{groupName}</h5>
                {num && <span className="text-gray-500 ml-1 text-xs">{num}</span>}
              </div>
              <span
                className={
                  isExpanded
                    ? "sidebar-group-icon expanded"
                    : "sidebar-group-icon"
                }
              >
                <RightOutlined />
              </span>
            </div>
            <div
              className={
                isExpanded ? "api-group-content expanded pb-2" : "api-group-content"
              }
            >
              <ul>
                {groupItem.children.map((apiItem) => {
                  return (
                    <ApiItem
                      apiItem={apiItem}
                      key={apiItem.key}
                      onClick={() => onSelectKeyChange?.(apiItem.key)}
                    />
                  );
                })}
              </ul>
            </div>

          </div>
        );
      })}
    </>
  );
};

export default ApiList;
