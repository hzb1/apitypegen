import process from "node:process";
import { fileURLToPath } from "node:url";
import type { ErrorEvent, Event, Exception, StackFrame } from "@sentry/node";
import { readPackageVersion } from "../package-metadata.js";

/** CLI 遥测上报时允许附带的执行上下文。 */
export type CliTelemetryContext = {
  /** 用户请求执行的命令，仅已知命令会被发送。 */
  command: string;

  /** 归一化后的稳定错误码。 */
  errorCode: string;
};

/** 读取 CLI 遥测配置时使用的环境变量集合。 */
export type CliTelemetryEnvironment = {
  /** 用户是否显式开启匿名错误上报。 */
  APITYPEGEN_TELEMETRY?: string;

  /** 覆盖内置 GlitchTip CLI 项目接收地址的可选 DSN。 */
  APITYPEGEN_GLITCHTIP_DSN?: string;

  /** 兼容旧版命名的匿名错误上报开关。 */
  TS_SWAGGER_TELEMETRY?: string;

  /** 兼容旧版命名的 GlitchTip CLI 项目接收地址。 */
  TS_SWAGGER_GLITCHTIP_DSN?: string;

  /** 通用的禁止遥测标记。 */
  DO_NOT_TRACK?: string;
};

const TELEMETRY_FLUSH_TIMEOUT_MS = 750;
const DEFAULT_GLITCHTIP_DSN =
  "https://dfe44a96f48249fd8e46561ff2df2ce4@monitor.huzhibin.top/2";
const CLI_DIST_DIRECTORY = fileURLToPath(new URL("../", import.meta.url))
  .replaceAll("\\", "/")
  .replace(/\/$/u, "");
const ENABLED_VALUES = new Set(["1", "true"]);
const ALLOWED_TAGS = new Set([
  "command",
  "error_code",
  "node_major",
  "platform",
  "arch",
]);

/**
 * 判断环境变量是否表达了肯定值。
 *
 * 当前仅接受 `1` 和不区分大小写的 `true`。
 */
function isEnabledValue(value: string | undefined): boolean {
  return ENABLED_VALUES.has(value?.trim().toLowerCase() ?? "");
}

/** 判断 CLI 是否获得了发送匿名错误事件的显式授权。 */
export function isCliTelemetryEnabled(environment: CliTelemetryEnvironment): boolean {
  if (isEnabledValue(environment.DO_NOT_TRACK)) return false;
  return isEnabledValue(environment.APITYPEGEN_TELEMETRY ?? environment.TS_SWAGGER_TELEMETRY);
}

/**
 * 清理可能包含来源地址、认证信息或用户目录的文本。
 *
 * 该函数会优先保护隐私，因此可能对普通错误文本进行过度脱敏。
 */
export function redactTelemetryText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>`]+/giu, "<source-url>")
    .replace(/file:\/\/\/[^\s"'<>`]+/giu, "<path>")
    .replace(/\bbearer\s+[a-z0-9._~+/=-]+/giu, "Bearer <redacted>")
    .replace(
      /\b(authorization|cookie|token|api[_-]?key|password|secret)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/giu,
      "$1=<redacted>",
    )
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/giu, "<email>")
    .replace(/\/(?:Users|home)\/[^/\s]+(?:\/[^\s:),]+)*/gu, "<path>")
    .replace(/(?<![\w:])\/(?:[^/\s:),]+\/)+[^/\s:),]*/gu, "<path>")
    .replace(/\b[a-z]:\\(?:[^\\\s:),]+\\)+[^\\\s:),]*/giu, "<path>");
}

/** 将文件 URL 或本机路径归一化为便于比较的斜杠路径。 */
function normalizeLocalStackPath(value: string): string {
  try {
    return (value.startsWith("file:") ? fileURLToPath(value) : value).replaceAll("\\", "/");
  } catch {
    return value.replaceAll("\\", "/");
  }
}

/** 判断单个路径是否位于当前安装的 APITypeGen 编译目录中。 */
function isCliApplicationPath(value: string | undefined): boolean {
  if (!value) return false;

  const normalized = normalizeLocalStackPath(value);
  const comparablePath = process.platform === "win32" ? normalized.toLowerCase() : normalized;
  const comparableRoot =
    process.platform === "win32" ? CLI_DIST_DIRECTORY.toLowerCase() : CLI_DIST_DIRECTORY;
  return comparablePath.startsWith(`${comparableRoot}/`);
}

/** 将本机堆栈路径转换为不包含用户目录的稳定 artifact 路径。 */
function sanitizeStackPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("node:")) return value;
  if (!isCliApplicationPath(value)) return "<path>";

  const normalized = normalizeLocalStackPath(value);
  const relativePath = normalized.slice(CLI_DIST_DIRECTORY.length + 1);
  return `app:///dist/${relativePath}`;
}

/** 判断堆栈帧是否来自随 npm 包公开发布的 CLI 编译目录。 */
function isCliApplicationFrame(frame: StackFrame): boolean {
  return isCliApplicationPath(frame.filename) || isCliApplicationPath(frame.abs_path);
}

/** 清理公开 CLI 源码帧中用于定位问题的单行代码。 */
function sanitizeSourceLine(value: string): string {
  return redactTelemetryText(value);
}

/** 清理异常堆栈中的单个调用帧。 */
function sanitizeStackFrame(frame: StackFrame): StackFrame {
  const isApplicationFrame = isCliApplicationFrame(frame);

  return {
    filename: sanitizeStackPath(frame.filename),
    abs_path: sanitizeStackPath(frame.abs_path),
    function: frame.function ? redactTelemetryText(frame.function) : undefined,
    module: frame.module ? redactTelemetryText(frame.module) : undefined,
    platform: frame.platform,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
    context_line:
      isApplicationFrame && frame.context_line
        ? sanitizeSourceLine(frame.context_line)
        : undefined,
    pre_context: isApplicationFrame
      ? frame.pre_context?.map(sanitizeSourceLine)
      : undefined,
    post_context: isApplicationFrame
      ? frame.post_context?.map(sanitizeSourceLine)
      : undefined,
  };
}

/** 清理 GlitchTip 事件中的单个异常。 */
function sanitizeException(exception: Exception): Exception {
  return {
    type: exception.type ? redactTelemetryText(exception.type) : undefined,
    value: exception.value ? redactTelemetryText(exception.value) : undefined,
    stacktrace: exception.stacktrace
      ? {
          frames: exception.stacktrace.frames?.map(sanitizeStackFrame),
        }
      : undefined,
  };
}

/** 仅保留 CLI 明确允许发送的低敏感度标签。 */
function sanitizeTags(tags: Event["tags"]): Event["tags"] {
  if (!tags) return undefined;

  return Object.fromEntries(
    Object.entries(tags)
      .filter(([key]) => ALLOWED_TAGS.has(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? redactTelemetryText(value) : value,
      ]),
  );
}

/**
 * 将 SDK 生成的事件收敛为 CLI 允许发送的字段白名单。
 *
 * 请求、用户、上下文、面包屑、模块列表和额外数据会被直接丢弃。
 */
export function sanitizeTelemetryEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: event.platform,
    release: event.release,
    environment: event.environment,
    message: event.message ? redactTelemetryText(event.message) : undefined,
    exception: event.exception
      ? {
          values: event.exception.values?.map(sanitizeException),
        }
      : undefined,
    tags: sanitizeTags(event.tags),
  };
}

/** 读取当前安装包版本，读取失败时不阻止 CLI 错误输出。 */
function readCliVersion(): string | undefined {
  try {
    return readPackageVersion();
  } catch {
    return undefined;
  }
}

/** 将任意用户命令归一化为低基数、不可识别用户输入的标签。 */
function normalizeCommandTag(command: string): string {
  return command === "search" || command === "gen" || command === "telemetry-test"
    ? command
    : "unknown";
}

/**
 * 向 GlitchTip 上报一个未知 CLI 异常。
 *
 * SDK 加载、初始化、发送和刷新失败都会被静默忽略，避免改变 CLI 原有行为。
 */
export async function reportUnknownCliError(
  error: unknown,
  context: CliTelemetryContext,
  environment: CliTelemetryEnvironment = process.env,
): Promise<boolean> {
  if (!isCliTelemetryEnabled(environment)) return false;

  try {
    const Sentry = await import("@sentry/node");
    const version = readCliVersion();

    Sentry.initWithoutDefaultIntegrations({
      dsn:
        environment.APITYPEGEN_GLITCHTIP_DSN?.trim() ||
        environment.TS_SWAGGER_GLITCHTIP_DSN?.trim() ||
        DEFAULT_GLITCHTIP_DSN,
      enabled: true,
      environment: "production",
      release: version ? `apitypegen@${version}` : undefined,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      skipOpenTelemetrySetup: true,
      integrations: [
        Sentry.linkedErrorsIntegration({ key: "cause", limit: 3 }),
        Sentry.contextLinesIntegration({ frameContextLines: 3 }),
      ],
      beforeSend: sanitizeTelemetryEvent,
    });
    Sentry.captureException(error, {
      tags: {
        command: normalizeCommandTag(context.command),
        error_code: context.errorCode,
        node_major: process.versions.node.split(".")[0] ?? "unknown",
        platform: process.platform,
        arch: process.arch,
      },
    });
    return await Sentry.flush(TELEMETRY_FLUSH_TIMEOUT_MS);
  } catch {
    // 遥测属于非关键路径，不得覆盖或污染原始 CLI 错误。
    return false;
  }
}

/** 构造一个来自真实 CLI 编译文件且包含 cause 链的诊断测试错误。 */
function createCliTelemetryTestError(): Error {
  const cause = new Error("CLI GlitchTip 测试 cause：用于验证异常链展示");
  return new Error("CLI GlitchTip 诊断测试：用于验证应用堆栈与源码上下文", {
    cause,
  });
}

/**
 * 显式发送一条 CLI GlitchTip 诊断测试事件。
 *
 * `DO_NOT_TRACK` 仍拥有最高优先级，测试环境可以继续覆盖内置 DSN。
 */
export async function sendCliTelemetryTestEvent(
  environment: CliTelemetryEnvironment = process.env,
): Promise<boolean> {
  return reportUnknownCliError(
    createCliTelemetryTestError(),
    {
      command: "telemetry-test",
      errorCode: "UNKNOWN_ERROR",
    },
    {
      ...environment,
      APITYPEGEN_TELEMETRY: "1",
    },
  );
}
