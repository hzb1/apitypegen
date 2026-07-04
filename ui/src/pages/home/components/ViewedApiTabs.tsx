import { Dropdown, Tabs } from "antd";
import { PushpinOutlined } from "@ant-design/icons";
import type { ApiDetail } from "../../../../types.ts";

type ViewedApiTabsProps = {
  orderedViewedApiKeys: string[];
  selectedApiKey: string | null;
  apiMap: Map<string, ApiDetail>;
  pinnedApiKeys: string[];
  onViewedTabSelect: (key: string) => void;
  removeViewedTab: (key: string) => void;
  closeOtherViewedTabs: (key: string) => void;
  togglePinViewedTab: (key: string) => void;
};

const formatPathTabLabel = (path: string) => {
  const normalized = path.split("?")[0].replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length) return path || "/";
  return `/${segments[segments.length - 1]}`;
};

export default function ViewedApiTabs(props: ViewedApiTabsProps) {
  const {
    orderedViewedApiKeys,
    selectedApiKey,
    apiMap,
    pinnedApiKeys,
    onViewedTabSelect,
    removeViewedTab,
    closeOtherViewedTabs,
    togglePinViewedTab,
  } = props;

  return (
    <div className="content-api-tabs">
      <div className="content-tab-heading">
        <h2>已查看接口</h2>
        <span>{orderedViewedApiKeys.length} 个</span>
      </div>
      {orderedViewedApiKeys.length > 0 ? (
        <Tabs
          className="doc-tabs-antd"
          activeKey={selectedApiKey ?? undefined}
          onChange={onViewedTabSelect}
          type="editable-card"
          hideAdd
          onEdit={(targetKey, action) => {
            if (action !== "remove" || typeof targetKey !== "string") return;
            removeViewedTab(targetKey);
          }}
          items={orderedViewedApiKeys.flatMap((key) => {
            const api = apiMap.get(key);
            if (!api) return [];
            const isPinned = pinnedApiKeys.includes(key);
            const summary = api.operation?.summary?.trim();
            const title = summary || formatPathTabLabel(api.path);
            const tooltip = summary || api.path;
            return [{
              key,
              label: (
                <Dropdown
                  trigger={["contextMenu"]}
                  menu={{
                    items: [
                      {
                        key: "toggle-pin",
                        label: isPinned ? "取消固定" : "固定标签",
                        icon: <PushpinOutlined />,
                      },
                      {key: "close-others", label: "关闭其它标签"},
                    ],
                    onClick: ({key: actionKey}) => {
                      if (actionKey === "toggle-pin") {
                        togglePinViewedTab(key);
                        return;
                      }
                      if (actionKey === "close-others") {
                        closeOtherViewedTabs(key);
                      }
                    },
                  }}
                >
                  <span className="viewed-tab-label" title={tooltip}>
                    {isPinned ? <PushpinOutlined className="viewed-tab-pin" /> : null}
                    <span>{title}</span>
                  </span>
                </Dropdown>
              ),
              closable: true,
            }];
          })}
        />
      ) : (
        <div className="content-viewed-empty">从左侧选择一个接口开始</div>
      )}
    </div>
  );
}
