import type {
  RequestDebugEntry,
  RequestDebugFetchType,
  RequestDebugSource,
  RequestDebugStage,
  RequestDebugStatus,
} from "./requestDebugStore.ts";

const STATUS_LABELS: Record<RequestDebugStatus, string> = {
  pending: "请求中",
  success: "成功",
  error: "失败",
  event: "事件",
  cancelled: "已取消",
};

const STAGE_LABELS: Record<RequestDebugStage, string> = {
  probe: "预探测",
  config: "配置探测",
  document: "文档加载",
  event: "事件",
};

const SOURCE_LABELS: Record<RequestDebugSource, string> = {
  "direct-document": "直接加载文档",
  "swagger-config-probe": "探测 Swagger 配置",
  "service-document": "加载服务文档",
  "auto-select-service": "自动选择服务",
  "extension-check": "检测浏览器扩展",
};

const FETCH_TYPE_LABELS: Record<RequestDebugFetchType, string> = {
  native: "浏览器直连",
  proxy: "扩展代理",
  event: "系统事件",
};

const REASON_LABELS: Record<string, string> = {
  "doc changed": "文档地址变化",
  "service changed": "服务变化",
  "auto selected first service": "自动选择第一个服务",
  "page visible or focused": "页面可见或获得焦点",
  "new request started": "新请求开始，取消上一轮加载",
  "component unmounted": "组件卸载，取消请求",
  "request aborted": "请求已取消",
};

const SENSITIVE_QUERY_KEYS = /^(token|access_token|auth|authorization|password|secret|key|api_key)$/i;

export function getStatusLabel(status: RequestDebugStatus) {
  return STATUS_LABELS[status] ?? status;
}

export function getStageLabel(stage: RequestDebugStage) {
  return STAGE_LABELS[stage] ?? stage;
}

export function getSourceLabel(source: RequestDebugSource) {
  return SOURCE_LABELS[source] ?? source;
}

export function getFetchTypeLabel(fetchType: RequestDebugFetchType) {
  return FETCH_TYPE_LABELS[fetchType] ?? fetchType;
}

export function getReasonLabel(reason: string) {
  return REASON_LABELS[reason] ?? reason;
}

export function sanitizeDebugUrl(value: string) {
  try {
    const url = new URL(value);
    url.searchParams.forEach((_, key) => {
      if (SENSITIVE_QUERY_KEYS.test(key)) {
        url.searchParams.set(key, "***");
      }
    });
    return url.toString();
  } catch {
    return value.replace(
      /(token|access_token|authorization|password|secret|api_key)=([^&\s]+)/gi,
      "$1=***",
    );
  }
}

export function getDurationLevel(entry: RequestDebugEntry) {
  const duration = entry.durationMs ?? 0;
  if (duration >= 10000) return "超时风险";
  if (duration >= 2000) return "较慢";
  return "";
}

export function getDiagnosticTips(entries: RequestDebugEntry[]) {
  const tips: string[] = [];
  const hasConfigProbe = entries.some((entry) => entry.source === "swagger-config-probe");
  const hasDirectDocument = entries.some((entry) => entry.source === "direct-document");
  const hasServiceDocument = entries.some((entry) => entry.source === "service-document");
  const failedEntries = entries.filter((entry) => entry.status === "error");
  const duplicateEntries = entries.filter((entry) => entry.duplicate);
  const proxyFailed = failedEntries.some((entry) => entry.fetchType === "proxy");
  const configEntries = entries.filter((entry) => entry.source === "swagger-config-probe");
  const configAllFailed = configEntries.length > 0 && configEntries.every((entry) => entry.status === "error");
  const slowEntries = entries.filter((entry) => (entry.durationMs ?? 0) >= 2000);
  const cancelledEntries = entries.filter((entry) => entry.status === "cancelled");

  if (hasConfigProbe && !hasDirectDocument) {
    tips.push("当前按服务根地址处理，只探测 Swagger 配置，未请求根路径。");
  }
  if (hasServiceDocument) {
    tips.push("已进入服务文档加载阶段，说明 Swagger 配置中找到了可用服务。");
  }
  if (duplicateEntries.length > 0) {
    tips.push("检测到重复触发，可能由 React StrictMode、reloadKey 或依赖变化触发。");
  }
  if (proxyFailed) {
    tips.push("扩展代理请求失败时，请检查扩展是否启用、目标地址是否可访问，以及证书/CORS/内网环境。");
  }
  if (configAllFailed) {
    tips.push("Swagger 配置探测全部失败，请确认服务根地址是否正确，或直接输入 OpenAPI JSON 地址。");
  }
  if (slowEntries.length > 0) {
    tips.push("存在较慢请求，超过 2 秒会标记为较慢，超过 10 秒会标记为超时风险。");
  }
  if (cancelledEntries.length > 0) {
    tips.push("部分请求被取消是正常行为，通常表示用户开始了新一轮加载或页面已切换。");
  }
  if (!tips.length) {
    tips.push("暂未发现明显异常，请继续加载文档后观察请求链路。");
  }

  return tips;
}

export function createDebugReport(entries: RequestDebugEntry[]) {
  const failedEntries = entries.filter((entry) => entry.status === "error");
  const duplicateEntries = entries.filter((entry) => entry.duplicate);
  const cancelledEntries = entries.filter((entry) => entry.status === "cancelled");
  const completedDurations = entries
    .map((entry) => entry.durationMs)
    .filter((duration): duration is number => typeof duration === "number" && duration > 0);
  const avgDuration = completedDurations.length
    ? Math.round(completedDurations.reduce((total, item) => total + item, 0) / completedDurations.length)
    : 0;

  const lines = [
    "TS Swagger 请求调试报告",
    "",
    `总记录数：${entries.length}`,
    `失败数：${failedEntries.length}`,
    `取消数：${cancelledEntries.length}`,
    `重复触发数：${duplicateEntries.length}`,
    `扩展代理请求数：${entries.filter((entry) => entry.fetchType === "proxy").length}`,
    `浏览器直连请求数：${entries.filter((entry) => entry.fetchType === "native").length}`,
    `平均耗时：${avgDuration ? `${avgDuration}ms` : "-"}`,
    "",
    "诊断建议：",
    ...getDiagnosticTips(entries).map((tip) => `- ${tip}`),
    "",
    "请求链路：",
    ...entries
      .slice()
      .reverse()
      .map((entry, index) => {
        const duration = typeof entry.durationMs === "number" ? `${entry.durationMs}ms` : "-";
        return [
          `${index + 1}. ${getSourceLabel(entry.source)}｜${getStatusLabel(entry.status)}｜${getFetchTypeLabel(entry.fetchType)}｜${duration}`,
          `   原因：${getReasonLabel(entry.reason)}`,
          `   URL：${sanitizeDebugUrl(entry.url)}`,
          entry.error ? `   错误：${entry.error}` : "",
          entry.duplicate ? "   标记：重复触发" : "",
        ].filter(Boolean).join("\n");
      }),
  ];

  return lines.join("\n");
}
