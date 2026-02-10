import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Divider,
  Empty,
  Input,
  Select,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type {
  Header,
  NetworkCookie,
  NetworkEntry,
  ResourceType,
} from "@extension/src/shared/networkTypes.ts";
import "./NetworkViewer.css";

const { Text } = Typography;

type StatusFilter =
  | "all"
  | "success"
  | "redirect"
  | "client-error"
  | "server-error"
  | "error";

const TYPE_FILTERS: Array<{ label: string; value: ResourceType | "all" }> = [
  { label: "全部", value: "all" },
  { label: "Document", value: "document" },
  { label: "Stylesheet", value: "stylesheet" },
  { label: "Script", value: "script" },
  { label: "Fetch/XHR", value: "fetch" },
  { label: "Image", value: "image" },
  { label: "Media", value: "media" },
  { label: "Font", value: "font" },
  { label: "WebSocket", value: "websocket" },
  { label: "Other", value: "other" },
];

const STATUS_FILTERS: Array<{ label: string; value: StatusFilter }> = [
  { label: "全部", value: "all" },
  { label: "成功 2xx", value: "success" },
  { label: "重定向 3xx", value: "redirect" },
  { label: "客户端 4xx", value: "client-error" },
  { label: "服务端 5xx", value: "server-error" },
  { label: "错误", value: "error" },
];

export interface NetworkViewerProps {
  entries: NetworkEntry[];
  onClear?: () => void;
  emptyText?: string;
}

const NetworkViewer: React.FC<NetworkViewerProps> = ({
  entries,
  onClear,
  emptyText = "暂无请求记录",
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState<ResourceType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (!entries.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !entries.find((item) => item.id === selectedId)) {
      setSelectedId(entries[0].id);
    }
  }, [entries, selectedId]);

  const selectedEntry = useMemo(() => {
    if (!entries.length) return null;
    return entries.find((item) => item.id === selectedId) ?? entries[0];
  }, [entries, selectedId]);

  const filteredEntries = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return entries.filter((entry) => {
      if (typeFilter !== "all" && entry.resourceType !== typeFilter) {
        return false;
      }

      if (statusFilter !== "all") {
        if (statusFilter === "error") {
          if (!entry.error) return false;
        } else {
          const status = entry.response?.status ?? 0;
          if (statusFilter === "success" && !(status >= 200 && status < 300)) {
            return false;
          }
          if (statusFilter === "redirect" && !(status >= 300 && status < 400)) {
            return false;
          }
          if (statusFilter === "client-error" && !(status >= 400 && status < 500)) {
            return false;
          }
          if (statusFilter === "server-error" && !(status >= 500 && status < 600)) {
            return false;
          }
        }
      }

      if (!keyword) return true;
      return (
        entry.url.toLowerCase().includes(keyword) ||
        entry.method.toLowerCase().includes(keyword)
      );
    });
  }, [entries, searchText, typeFilter, statusFilter]);

  const columns = useMemo(
    () => [
      {
        title: "Name",
        dataIndex: "url",
        key: "url",
        sorter: (a: NetworkEntry, b: NetworkEntry) =>
          a.url.localeCompare(b.url),
        render: (value: string) => (
          <div className="network-url">
            <span className="network-url-path">{shortenUrl(value)}</span>
          </div>
        ),
      },
      {
        title: "Method",
        dataIndex: "method",
        key: "method",
        width: 90,
        sorter: (a: NetworkEntry, b: NetworkEntry) =>
          a.method.localeCompare(b.method),
        render: (value: string) => (
          <Tag color={methodColor(value)}>{value.toUpperCase()}</Tag>
        ),
      },
      {
        title: "Status",
        key: "status",
        width: 90,
        sorter: (a: NetworkEntry, b: NetworkEntry) =>
          (a.response?.status ?? 0) - (b.response?.status ?? 0),
        render: (_: unknown, record: NetworkEntry) => {
          if (record.response?.status) {
            const status = record.response.status;
            return <Tag color={statusColor(status)}>{status}</Tag>;
          }
          if (record.error) {
            return <Tag color="red">ERR</Tag>;
          }
          return <Text type="secondary">-</Text>;
        },
      },
      {
        title: "Type",
        dataIndex: "resourceType",
        key: "resourceType",
        width: 110,
        sorter: (a: NetworkEntry, b: NetworkEntry) =>
          a.resourceType.localeCompare(b.resourceType),
        render: (value: string) => (
          <Text className="network-type">{value}</Text>
        ),
      },
      {
        title: "Size",
        key: "size",
        width: 110,
        sorter: (a: NetworkEntry, b: NetworkEntry) =>
          getEntrySize(a) - getEntrySize(b),
        render: (_: unknown, record: NetworkEntry) => {
          const size =
            record.sizes?.responseBodySize ??
            record.sizes?.encodedDataLength ??
            record.response?.encodedDataLength;
          return <Text>{formatBytes(size)}</Text>;
        },
      },
      {
        title: "Time",
        key: "time",
        width: 110,
        sorter: (a: NetworkEntry, b: NetworkEntry) =>
          (a.duration ?? 0) - (b.duration ?? 0),
        render: (_: unknown, record: NetworkEntry) => (
          <Text>{formatDuration(record.duration)}</Text>
        ),
      },
    ],
    [],
  );

  return (
    <div className="network-viewer">
      <div className="network-toolbar">
        <Input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="搜索 Name / Method"
          className="network-search"
          allowClear
        />
        <Select
          value={typeFilter}
          onChange={(value) =>
            setTypeFilter(value as ResourceType | "all")
          }
          options={TYPE_FILTERS}
          className="network-filter"
        />
        <Select
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
          options={STATUS_FILTERS}
          className="network-filter"
        />
        <div className="network-count">
          <Text type="secondary">共 {filteredEntries.length} 条</Text>
        </div>
        {onClear && (
          <Button onClick={onClear} className="network-clear">
            清空
          </Button>
        )}
      </div>
      <Divider />

      <Table<NetworkEntry>
        columns={columns}
        dataSource={filteredEntries}
        rowKey="id"
        pagination={false}
        size="middle"
        rowClassName={(record) =>
          [
            record.id === selectedEntry?.id ? "network-row-selected" : "",
            record.error ? "network-row-error" : "",
          ]
            .filter(Boolean)
            .join(" ")
        }
        onRow={(record) => ({
          onClick: () => setSelectedId(record.id),
        })}
        locale={{ emptyText }}
      />

      <Divider />

      {selectedEntry ? (
        <Tabs
          items={[
            {
              key: "headers",
              label: "标头",
              children: renderHeadersTab(selectedEntry),
            },
            {
              key: "payload",
              label: "负载",
              children: renderPayloadTab(selectedEntry),
            },
            {
              key: "preview",
              label: "预览",
              children: renderPreviewTab(selectedEntry),
            },
            {
              key: "response",
              label: "响应",
              children: renderResponseTab(selectedEntry),
            },
            {
              key: "initiator",
              label: "启动器",
              children: renderInitiatorTab(selectedEntry),
            },
            {
              key: "timing",
              label: "时间",
              children: renderTimingTab(selectedEntry),
            },
            {
              key: "cookies",
              label: "Cookie",
              children: renderCookiesTab(selectedEntry),
            },
          ]}
        />
      ) : (
        <Empty description="选择一条请求查看详情" />
      )}
    </div>
  );
};

export default NetworkViewer;

function renderHeadersTab(entry: NetworkEntry) {
  return (
    <div className="network-tab">
      <section className="network-tab-section">
        <Text className="network-tab-title">Request Headers</Text>
        {renderHeaderTable(entry.request.headers)}
      </section>
      <section className="network-tab-section">
        <Text className="network-tab-title">Response Headers</Text>
        {renderHeaderTable(entry.response?.headers)}
      </section>
    </div>
  );
}

function renderPayloadTab(entry: NetworkEntry) {
  const body = entry.request.postData;
  if (!body) {
    return <Empty description="无请求负载" />;
  }

  if (body.json !== undefined) {
    return <pre className="network-code">{pretty(body.json)}</pre>;
  }

  if (body.params?.length) {
    return (
      <Table
        columns={[
          { title: "Name", dataIndex: "name", key: "name" },
          { title: "Value", dataIndex: "value", key: "value" },
        ]}
        dataSource={body.params.map((item, index) => ({
          key: `${item.name}-${index}`,
          ...item,
        }))}
        pagination={false}
        size="small"
      />
    );
  }

  if (body.text !== undefined) {
    return <pre className="network-code">{body.text}</pre>;
  }

  return <Empty description="无请求负载" />;
}

function renderPreviewTab(entry: NetworkEntry) {
  const content = entry.response?.content;
  if (!content) return <Empty description="无响应预览" />;

  if (content.mimeType?.startsWith("image/") && content.base64) {
    const src = `data:${content.mimeType};base64,${content.base64}`;
    return (
      <div className="network-image-preview">
        <img src={src} alt="preview" />
      </div>
    );
  }

  if (content.json !== undefined) {
    return <pre className="network-code">{pretty(content.json)}</pre>;
  }

  if (content.text !== undefined) {
    return <pre className="network-code">{content.text}</pre>;
  }

  if (content.base64) {
    return <pre className="network-code">Base64 内容暂不渲染</pre>;
  }

  return <Empty description="无响应预览" />;
}

function renderResponseTab(entry: NetworkEntry) {
  const content = entry.response?.content;
  if (!content) return <Empty description="无响应内容" />;
  if (content.base64 && content.mimeType?.startsWith("image/")) {
    return <pre className="network-code">{content.base64}</pre>;
  }
  const text = content.text ?? (content.json ? pretty(content.json) : "");
  if (!text) return <Empty description="无响应内容" />;
  return <pre className="network-code">{text}</pre>;
}

function renderInitiatorTab(entry: NetworkEntry) {
  const initiator = entry.initiator;
  if (!initiator) return <Empty description="无启动器信息" />;
  return (
    <div className="network-tab">
      <div className="network-tab-row">
        <Text type="secondary">Type</Text>
        <Text>{initiator.type}</Text>
      </div>
      {initiator.url && (
        <div className="network-tab-row">
          <Text type="secondary">URL</Text>
          <Text>{initiator.url}</Text>
        </div>
      )}
      {initiator.lineNumber !== undefined && (
        <div className="network-tab-row">
          <Text type="secondary">Line</Text>
          <Text>{initiator.lineNumber}</Text>
        </div>
      )}
    </div>
  );
}

function renderTimingTab(entry: NetworkEntry) {
  const timing = entry.timing;
  if (!timing) return <Empty description="无时间信息" />;
  return (
    <div className="network-tab">
      <div className="network-tab-row">
        <Text type="secondary">Start</Text>
        <Text>{formatDateTime(timing.startTime)}</Text>
      </div>
      {timing.endTime && (
        <div className="network-tab-row">
          <Text type="secondary">End</Text>
          <Text>{formatDateTime(timing.endTime)}</Text>
        </div>
      )}
      {timing.duration !== undefined && (
        <div className="network-tab-row">
          <Text type="secondary">Duration</Text>
          <Text>{formatDuration(timing.duration)}</Text>
        </div>
      )}
    </div>
  );
}

function renderCookiesTab(entry: NetworkEntry) {
  const requestCookies = entry.request.cookies ?? [];
  const responseCookies = entry.response?.cookies ?? [];

  return (
    <div className="network-tab">
      <section className="network-tab-section">
        <Text className="network-tab-title">Request Cookies</Text>
        {renderCookieTable(requestCookies)}
      </section>
      <section className="network-tab-section">
        <Text className="network-tab-title">Response Cookies</Text>
        {renderCookieTable(responseCookies)}
      </section>
    </div>
  );
}

function renderHeaderTable(headers?: Header[]) {
  if (!headers || !headers.length) {
    return <Empty description="无数据" />;
  }
  return (
    <Table
      columns={[
        { title: "Name", dataIndex: "name", key: "name", width: 220 },
        { title: "Value", dataIndex: "value", key: "value" },
      ]}
      dataSource={headers.map((item, index) => ({
        key: `${item.name}-${index}`,
        ...item,
      }))}
      pagination={false}
      size="small"
    />
  );
}

function renderCookieTable(cookies: NetworkCookie[]) {
  if (!cookies.length) {
    return <Empty description="无 Cookie" />;
  }
  return (
    <Table
      columns={[
        { title: "Name", dataIndex: "name", key: "name", width: 160 },
        { title: "Value", dataIndex: "value", key: "value" },
        { title: "Domain", dataIndex: "domain", key: "domain" },
        { title: "Path", dataIndex: "path", key: "path" },
      ]}
      dataSource={cookies.map((item, index) => ({
        key: `${item.name}-${index}`,
        ...item,
      }))}
      pagination={false}
      size="small"
    />
  );
}

function shortenUrl(value: string): string {
  try {
    const u = new URL(value);
    const path = u.pathname.length > 1 ? u.pathname : "/";
    return `${u.host}${path}${u.search}`;
  } catch {
    return value;
  }
}

function methodColor(method: string): string {
  const normalized = method.toUpperCase();
  if (normalized === "GET") return "green";
  if (normalized === "POST") return "blue";
  if (normalized === "PUT") return "orange";
  if (normalized === "DELETE") return "red";
  if (normalized === "PATCH") return "geekblue";
  return "default";
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return "green";
  if (status >= 300 && status < 400) return "gold";
  if (status >= 400 && status < 500) return "orange";
  return "red";
}

function formatBytes(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function formatDateTime(timestamp?: number): string {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getEntrySize(entry: NetworkEntry): number {
  return (
    entry.sizes?.responseBodySize ??
    entry.sizes?.encodedDataLength ??
    entry.response?.encodedDataLength ??
    0
  );
}
