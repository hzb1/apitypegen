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
      className={"relative scroll-m-4 first:scroll-m-20"}
    >
      <a
        className={clsx(
          `group flex items-center pr-3 cursor-pointer gap-x-3 text-left break-words hyphens-auto ml-2 border-l py-2 lg:py-1.5 w-[calc(100%-1rem)]
             dark:text-primary-light pl-3 pr-3`,
          isSelected
            ? `border-primary dark:border-primary-light text-primary  [text-shadow:-0.2px_0_0_currentColor,0.2px_0_0_currentColor]`
            : `border-gray-950/5 dark:border-white/10 hover:border-gray-950/20 dark:hover:border-white/20 text-gray-700 hover:text-gray-900
            dark:text-gray-400 dark:hover:text-gray-300hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300`,
        )}
        onClick={onClick}
      >
        <span className={"method-nav-pill flex items-center w-8"}>
          <Method method={apiItem.method} isActive={isSelected} />
        </span>
        <div className={"flex-1 flex items-center space-x-2.5 truncate"}>
          {apiName}
        </div>
      </a>
    </li>
  );
};

export default ApiItem;
