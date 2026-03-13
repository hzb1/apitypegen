import "./ApiList.css";
import type { ApiDetail } from "../../../types.ts";
import ApiItem from "./ApiItem.tsx";
import React, { useEffect, useMemo, useRef } from "react";
import { AimOutlined, RightOutlined } from "@ant-design/icons";
import { FloatButton} from "antd";
import { useScrollToSelected } from "@/hooks/useScrollToSelected.ts";

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
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
};

const ApiList: React.FC<ApiListProps> = ({
  apis,
  onSelectKeyChange,
  onGroupTitleClick,
  scrollContainerRef,
}) => {

  const handleGroupTitleClick = (groupItem: ApiGroup) => {
    onGroupTitleClick?.(groupItem);
  };

  const fallbackContainerRef = useRef<HTMLElement>(null);
  const containerRef = scrollContainerRef ?? fallbackContainerRef;

  const selectedKey = useMemo(() => {
    for (const group of apis) {
      const match = group.children.find((item) => item.isSelected);
      if (match) return match.key;
    }
    return "";
  }, [apis]);

  const expandedToken = useMemo(
    () =>
      apis
        .map((group) => `${group.id}:${group.isExpanded}`)
        .join("|"),
    [apis],
  );

  const targetSelector = useMemo(() => {
    if (!selectedKey) return "";
    const escaped =
      typeof CSS !== "undefined" && "escape" in CSS
        ? CSS.escape(selectedKey)
        : selectedKey.replace(/["\\]/g, "\\$&");
    return `[data-api-key="${escaped}"]`;
  }, [selectedKey]);

  const { show, scrollToSelected } = useScrollToSelected({
    containerRef,
    targetSelector,
    enabled: Boolean(selectedKey),
    deps: [expandedToken],
  });

  const hasInitialAutoScrolledRef = useRef(false);
  useEffect(() => {
    if (hasInitialAutoScrolledRef.current || !selectedKey || !targetSelector) {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const rafId = requestAnimationFrame(() => {
      const target = container.querySelector(targetSelector) as HTMLElement | null;
      if (!target) return;
      target.scrollIntoView({ behavior: "auto", block: "center" });
      hasInitialAutoScrolledRef.current = true;
    });

    return () => cancelAnimationFrame(rafId);
  }, [containerRef, selectedKey, targetSelector, expandedToken]);

  return (
    <div className="api-list-root">
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
              className="api-list-group-title"
              onClick={() => handleGroupTitleClick(groupItem)}
            >
              <div className="api-list-group-name">
                <h5>{groupName}</h5>
                {num && <span>{num}</span>}
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
                isExpanded ? "api-group-content expanded" : "api-group-content"
              }
            >
              <ul className="api-list-group-children">
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
      {show && (
          <FloatButton
            className={"api-list-jump"}
            type="default"
            shape="circle"
            icon={<AimOutlined />}
            onClick={scrollToSelected}
          />
      )}
    </div>
  );
};

export default ApiList;
