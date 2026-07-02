import { useMemo, useState } from "react";
import { Badge, Button, Drawer, Empty, Select, Switch, Tag, Tooltip } from "antd";
import { BugOutlined, CopyOutlined, DeleteOutlined, FileTextOutlined } from "@ant-design/icons";
import {
  requestDebugStore,
  useRequestDebugSnapshot,
  type RequestDebugEntry,
  type RequestDebugFetchType,
  type RequestDebugSource,
  type RequestDebugStatus,
} from "./requestDebugStore.ts";
import {
  createDebugReport,
  getDiagnosticTips,
  getDurationLevel,
  getFetchTypeLabel,
  getReasonLabel,
  getSourceLabel,
  getStageLabel,
  getStatusLabel,
  sanitizeDebugUrl,
} from "./requestDebugLabels.ts";
import "./RequestDebugPanel.css";

type StatusFilter = "all" | RequestDebugStatus;
type SourceFilter = "all" | RequestDebugSource;
type FetchTypeFilter = "all" | RequestDebugFetchType;

function statusColor(entry: RequestDebugEntry) {
  if (entry.status === "success") return "success";
  if (entry.status === "error") return "error";
  if (entry.status === "pending") return "processing";
  if (entry.status === "cancelled") return "warning";
  return "default";
}

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString();
}

function formatDuration(entry: RequestDebugEntry) {
  if (typeof entry.durationMs !== "number") return "-";
  return `${entry.durationMs}ms`;
}

export default function RequestDebugPanel() {
  const { available, enabled, entries } = useRequestDebugSnapshot();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [fetchTypeFilter, setFetchTypeFilter] = useState<FetchTypeFilter>("all");
  const [failedOnly, setFailedOnly] = useState(false);
  const [duplicateOnly, setDuplicateOnly] = useState(false);

  const stats = useMemo(() => {
    const completedDurations = entries
      .map((entry) => entry.durationMs)
      .filter((duration): duration is number => typeof duration === "number" && duration > 0);
    return {
      total: entries.length,
      failed: entries.filter((entry) => entry.status === "error").length,
      cancelled: entries.filter((entry) => entry.status === "cancelled").length,
      duplicate: entries.filter((entry) => entry.duplicate).length,
      proxy: entries.filter((entry) => entry.fetchType === "proxy").length,
      native: entries.filter((entry) => entry.fetchType === "native").length,
      avgDuration: completedDurations.length
        ? Math.round(completedDurations.reduce((total, item) => total + item, 0) / completedDurations.length)
        : 0,
    };
  }, [entries]);

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (failedOnly && entry.status !== "error") return false;
        if (duplicateOnly && !entry.duplicate) return false;
        if (statusFilter !== "all" && entry.status !== statusFilter) return false;
        if (sourceFilter !== "all" && entry.source !== sourceFilter) return false;
        if (fetchTypeFilter !== "all" && entry.fetchType !== fetchTypeFilter) return false;
        return true;
      }),
    [duplicateOnly, entries, failedOnly, fetchTypeFilter, sourceFilter, statusFilter],
  );

  const diagnosticTips = useMemo(() => getDiagnosticTips(entries), [entries]);
  const flowEntries = useMemo(() => entries.slice().reverse(), [entries]);

  if (!available) return null;

  const handleCopyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
  };

  const handleCopyReport = async () => {
    await navigator.clipboard.writeText(createDebugReport(entries));
  };

  return (
    <>
      <Tooltip title="请求调试：查看文档加载过程">
        <button
          type="button"
          className="request-debug-trigger"
          onClick={() => setOpen(true)}
        >
          <Badge count={enabled ? entries.length : 0} size="small">
            <BugOutlined />
          </Badge>
        </button>
      </Tooltip>

      <Drawer
        title="请求调试"
        open={open}
        onClose={() => setOpen(false)}
        width="min(560px, 100vw)"
        extra={
          <div className="request-debug-actions">
            <span className="request-debug-switch-label">启用</span>
            <Switch
              size="small"
              checked={enabled}
              onChange={(checked) => requestDebugStore.setEnabled(checked)}
            />
            <Tooltip title="复制 JSON">
              <Button
                size="small"
                icon={<CopyOutlined />}
                disabled={!entries.length}
                onClick={() => void handleCopyJson()}
              />
            </Tooltip>
            <Tooltip title="复制排查报告">
              <Button
                size="small"
                icon={<FileTextOutlined />}
                disabled={!entries.length}
                onClick={() => void handleCopyReport()}
              />
            </Tooltip>
            <Tooltip title="清空">
              <Button
                size="small"
                icon={<DeleteOutlined />}
                disabled={!entries.length}
                onClick={() => requestDebugStore.clear()}
              />
            </Tooltip>
          </div>
        }
      >
        <div className="request-debug-state">
          <Tag color={enabled ? "success" : "default"}>{enabled ? "已启用" : "已关闭"}</Tag>
          {stats.failed > 0 && <Tag color="error">{stats.failed} 个失败请求</Tag>}
          {stats.cancelled > 0 && <Tag color="warning">{stats.cancelled} 个已取消</Tag>}
          {stats.duplicate > 0 && <Tag color="warning">{stats.duplicate} 个重复触发</Tag>}
        </div>

        <div className="request-debug-summary">
          <div><strong>{stats.total}</strong><span>总记录数</span></div>
          <div><strong>{stats.failed}</strong><span>失败数</span></div>
          <div><strong>{stats.cancelled}</strong><span>取消数</span></div>
          <div><strong>{stats.duplicate}</strong><span>重复触发</span></div>
          <div><strong>{stats.proxy}</strong><span>扩展代理</span></div>
          <div><strong>{stats.native}</strong><span>浏览器直连</span></div>
          <div><strong>{stats.avgDuration ? `${stats.avgDuration}ms` : "-"}</strong><span>平均耗时</span></div>
        </div>

        <div className="request-debug-tips">
          <div className="request-debug-section-title">诊断建议</div>
          {diagnosticTips.map((tip) => (
            <div key={tip} className="request-debug-tip">{tip}</div>
          ))}
        </div>

        <div className="request-debug-flow">
          <div className="request-debug-section-title">请求链路</div>
          {flowEntries.length ? (
            <div className="request-debug-flow-list">
              {flowEntries.map((entry, index) => (
                <span key={entry.id}>
                  {index > 0 && <em>→</em>}
                  {getSourceLabel(entry.source)}
                </span>
              ))}
            </div>
          ) : (
            <div className="request-debug-empty-line">加载文档后，这里会显示请求链路。</div>
          )}
        </div>

        <div className="request-debug-filters">
          <Select
            size="small"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "全部状态" },
              { value: "pending", label: "请求中" },
              { value: "success", label: "成功" },
              { value: "error", label: "失败" },
              { value: "cancelled", label: "已取消" },
              { value: "event", label: "事件" },
            ]}
          />
          <Select
            size="small"
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { value: "all", label: "全部来源" },
              { value: "direct-document", label: "文档" },
              { value: "swagger-config-probe", label: "配置" },
              { value: "service-document", label: "服务" },
              { value: "extension-check", label: "扩展检测" },
              { value: "auto-select-service", label: "自动选择服务" },
            ]}
          />
          <Select
            size="small"
            value={fetchTypeFilter}
            onChange={setFetchTypeFilter}
            options={[
              { value: "all", label: "全部方式" },
              { value: "native", label: "浏览器直连" },
              { value: "proxy", label: "扩展代理" },
              { value: "event", label: "系统事件" },
            ]}
          />
          <Button
            size="small"
            type={failedOnly ? "primary" : "default"}
            onClick={() => setFailedOnly((current) => !current)}
          >
            只看失败
          </Button>
          <Button
            size="small"
            type={duplicateOnly ? "primary" : "default"}
            onClick={() => setDuplicateOnly((current) => !current)}
          >
            只看重复触发
          </Button>
        </div>

        {filteredEntries.length ? (
          <div className="request-debug-list">
            {filteredEntries.map((entry) => {
              const durationLevel = getDurationLevel(entry);
              return (
              <article
                key={entry.id}
                className={[
                  "request-debug-entry",
                  `is-${entry.status}`,
                  entry.duplicate ? "is-duplicate" : "",
                ].filter(Boolean).join(" ")}
              >
                <div className="request-debug-entry-head">
                  <div className="request-debug-entry-title">
                    <Tag color={statusColor(entry)}>{getStatusLabel(entry.status)}</Tag>
                    <strong>{getSourceLabel(entry.source)}</strong>
                    {entry.duplicate && <Tag color="warning">重复触发</Tag>}
                    {durationLevel && <Tag color="orange">{durationLevel}</Tag>}
                  </div>
                  <span>{formatDuration(entry)}</span>
                </div>
                <div className="request-debug-url">{sanitizeDebugUrl(entry.url)}</div>
                <div className="request-debug-meta">
                  <span>方法：{entry.method}</span>
                  <span>方式：{getFetchTypeLabel(entry.fetchType)}</span>
                  <span>阶段：{getStageLabel(entry.stage)}</span>
                  <span>状态码：{entry.statusCode ?? "-"}</span>
                  <span>时间：{formatTime(entry.startedAt)}</span>
                </div>
                <div className="request-debug-reason">触发原因：{getReasonLabel(entry.reason)}</div>
                <details className="request-debug-key">
                  <summary>请求指纹</summary>
                  <div>{entry.requestKey}</div>
                </details>
                {(entry.error || entry.detail) && (
                  <div className="request-debug-detail">
                    <strong>{entry.error ? "错误信息" : "详情"}</strong>
                    <span>{entry.error || entry.detail}</span>
                  </div>
                )}
              </article>
            )})}
          </div>
        ) : (
          <Empty description={enabled ? "加载文档后，这里会显示每一次请求的触发原因" : "请求调试已关闭"} />
        )}
      </Drawer>
    </>
  );
}
