import React from "react";
import { Button, Empty } from "antd";
import { DeleteOutlined, HistoryOutlined } from "@ant-design/icons";
import type { SearchHistoryItem } from "@/hooks/useSearchHistory.ts";

type SearchHistoryListProps = {
  items: SearchHistoryItem[];
  onUse: (query: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
};

const SearchHistoryList: React.FC<SearchHistoryListProps> = ({
  items,
  onUse,
  onRemove,
  onClear,
}) => {
  if (!items.length) {
    return <Empty description="暂无搜索历史" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          最近搜索
        </div>
        <Button type="link" size="small" onClick={onClear}>
          清空
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="group flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 transition hover:border-gray-300 hover:bg-gray-50"
          >
            <button
              type="button"
              onClick={() => onUse(item.query)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
            >
              <span className="mt-0.5 shrink-0 text-gray-400">
                <HistoryOutlined />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-700">
                  {item.query}
                </span>
                <span className="block text-xs text-gray-500">
                  最近使用 {formatRelativeTime(item.updatedAt)}
                </span>
              </span>
            </button>
            <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
              x{item.count}
            </span>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
              aria-label="删除历史记录"
            >
              <DeleteOutlined />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SearchHistoryList;

function formatRelativeTime(timestamp: number): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "刚刚";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} 天前`;
  return new Date(timestamp).toLocaleDateString();
}
