import React from "react";
import type { ApiGroup } from "../ApiList/ApiList.tsx";

export type SearchMatchType = "路径" | "名称" | "ID" | "模型" | "方法";

export type SearchResultItemData = {
  matchType: SearchMatchType;
  groupName: string;
  serviceName?: string;
  serviceValue?: string;
  item: ApiGroup["children"][number];
};

type ApiSearchResultItemProps = {
  data: SearchResultItemData;
  onSelect: (key: string) => void;
};

const ApiSearchResultItem: React.FC<ApiSearchResultItemProps> = ({
  data,
  onSelect,
}) => {
  const { item, groupName, matchType, serviceName } = data;
  const summary = item.operation?.summary || item.path;
  const method = item.method.toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      className={
        "group w-full rounded-xl border px-3 py-2 text-left transition cursor-pointer " +
        (item.isSelected
          ? "border-blue-500 bg-blue-50"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900">
            {summary}
          </div>
          <div className="mt-1 truncate text-xs text-gray-500">{item.path}</div>
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
          {method}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        <span className="rounded-md bg-gray-100 px-1.5 py-0.5">{matchType}</span>
        {serviceName ? <span className="truncate">{serviceName}</span> : null}
        <span className="truncate">{groupName}</span>
      </div>
    </button>
  );
};

export default ApiSearchResultItem;
