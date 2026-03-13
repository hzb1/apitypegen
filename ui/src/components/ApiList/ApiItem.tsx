import type { ApiDetail } from "../../../types.ts";
import React from "react";
import clsx from "clsx";
import Method from "../ui/Method/Method.tsx";

type TData = ApiDetail & {
  // 是否选中
  isSelected: boolean;
};

const ApiItem: React.FC<{ apiItem: TData; onClick: () => void }> = ({
  apiItem,
  onClick,
}) => {
  const { isSelected } = apiItem;
  const apiName = apiItem.operation?.summary ?? apiItem.path;
  return (
    <li
      key={apiItem.key}
      id={apiItem.key}
      data-api-key={apiItem.key}
      className="api-list-item"
    >
      <a
        className={clsx(
          "api-list-item-link",
          isSelected && "is-selected",
        )}
        onClick={onClick}
      >
        <span className="method-nav-pill">
          <Method method={apiItem.method} isActive={isSelected} />
        </span>
        <div className="api-list-item-copy">
          <span className="api-list-item-summary" title={apiName}>{apiName}</span>
          <span className="api-list-item-path" title={apiItem.path}>{apiItem.path}</span>
        </div>
      </a>
    </li>
  );
};

export default ApiItem;
