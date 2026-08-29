import type { ApiItem } from "../core/api-index.js";
import type { SwaggerSource } from "../core/swagger-source.js";

/**
 * CLI 支持的命令。
 *
 * - `inspect`：识别用户明确提供的接口文档地址。
 * - `search`：按关键词检索 API。
 * - `gen`：为指定 API 生成 TypeScript 类型。
 */
export type CliCommand = "inspect" | "search" | "gen";

/**
 * CLI JSON 协议使用的稳定错误码。
 *
 * - `INVALID_COMMAND`：命令不存在或已经删除。
 * - `INVALID_ARGUMENT`：命令参数缺失、冲突或取值无效。
 * - `CONFIRMATION_REQUIRED`：生成代码前尚未获得用户对接口的明确确认。
 * - `SOURCE_LOAD_FAILED`：无法读取用户指定的文档来源。
 * - `SOURCE_TIMEOUT`：读取文档来源或浏览器发现超时。
 * - `SOURCE_TYPE_UNKNOWN`：响应内容无法识别为支持的接口文档来源。
 * - `OPENAPI_INVALID`：响应内容不是有效的 OpenAPI 文档。
 * - `SWAGGER_CONFIG_INVALID`：响应内容不是有效的 swagger-config。
 * - `CHROME_NOT_FOUND`：UI 模式无法找到可用的系统 Chrome。
 * - `SERVICE_NOT_FOUND`：未找到用户指定的服务或文档。
 * - `SERVICE_LOAD_FAILED`：指定服务的 OpenAPI 文档加载失败。
 * - `INCOMPLETE_SERVICE_LOAD`：部分服务加载失败，无法确定生成目标是否唯一。
 * - `API_NOT_FOUND`：已加载文档中不存在指定 API。
 * - `AMBIGUOUS_API`：多个服务中存在相同的 API 标识。
 * - `CLIPBOARD_FAILED`：生成结果无法写入系统剪贴板。
 * - `UNKNOWN_ERROR`：无法归类的内部错误。
 */
export type CliErrorCode =
  | "INVALID_COMMAND"
  | "INVALID_ARGUMENT"
  | "CONFIRMATION_REQUIRED"
  | "SOURCE_LOAD_FAILED"
  | "SOURCE_TIMEOUT"
  | "SOURCE_TYPE_UNKNOWN"
  | "OPENAPI_INVALID"
  | "SWAGGER_CONFIG_INVALID"
  | "CHROME_NOT_FOUND"
  | "SERVICE_NOT_FOUND"
  | "SERVICE_LOAD_FAILED"
  | "INCOMPLETE_SERVICE_LOAD"
  | "API_NOT_FOUND"
  | "AMBIGUOUS_API"
  | "CLIPBOARD_FAILED"
  | "UNKNOWN_ERROR";

/** 搜索结果传递给 gen 命令时使用的 API 选择器。 */
export type ApiSelector = {
  /** API 所属服务的名称。 */
  service: string;

  /** API 使用的 HTTP 方法。 */
  method: ApiItem["method"];

  /** API 在 OpenAPI 文档中的路径。 */
  path: string;
};

/** 构造 gen 恢复命令时允许缺省的 API 选择条件。 */
export type PartialApiSelector = {
  /** 需要隔离加载的服务名称。 */
  service?: string;

  /** 需要生成类型的 HTTP 方法。 */
  method?: string;

  /** 需要生成类型的 API 路径。 */
  path?: string;
};

/** CLI JSON 协议中的警告项。 */
export type CliProtocolWarning = {
  /** 供调用方稳定判断警告类型的代码。 */
  code: string;

  /** 面向用户展示的警告说明。 */
  message: string;

  /** 与警告相关的可选结构化信息。 */
  details?: unknown;
};

/**
 * CLI 错误恢复建议的处理方式。
 *
 * - `retry`：使用建议参数重新执行命令。
 * - `select`：从候选 API 中选择一个后重新执行命令。
 */
export type CliRecoveryAction = "retry" | "select";

/** CLI 错误恢复建议中的可执行命令。 */
export type CliRecoveryCommand = {
  /** 需要重新执行的 CLI 命令。 */
  command: CliCommand;

  /** 以数组形式提供的命令参数，避免调用方重新解析 Shell 字符串。 */
  args: string[];
};

/** CLI 错误恢复建议中的 API 候选项。 */
export type CliRecoveryCandidate = {
  /** 供用户或 AI 理解候选接口用途的摘要。 */
  summary: string;

  /** 可直接传递给 gen 命令的 API 选择器。 */
  selector: ApiSelector;
};

/** 语义恢复中的类型生成候选项。 */
export type GenerateTypesRecoveryCandidate = {
  /** 供用户或 AI 理解候选接口用途的摘要。 */
  summary: string;

  /** 可直接用于重新生成类型的精确选择器。 */
  selector: ApiSelector;
};

/**
 * CLI 与 MCP 适配层共用的错误恢复意图。
 *
 * - `inspect-source`：重新识别用户明确提供的来源地址。
 * - `search-api`：使用明确来源重新搜索接口。
 * - `generate-types`：选择候选接口后重新生成类型。
 * - `ask-user`：缺少必要信息，需要询问用户。
 * - `stop`：错误不可安全恢复，应停止自动调用。
 */
export type RecoveryIntent =
  | {
      /** 恢复动作为重新识别来源。 */
      action: "inspect-source";

      /** 需要重新识别的用户来源地址。 */
      url: string;

      /** 面向调用方解释下一步操作。 */
      message: string;
    }
  | {
      /** 恢复动作为重新搜索接口。 */
      action: "search-api";

      /** 重新搜索时使用的明确文档来源。 */
      source: SwaggerSource;

      /** 重新搜索时使用的关键词。 */
      keyword: string;

      /** 面向调用方解释下一步操作。 */
      message: string;
    }
  | {
      /** 恢复动作为选择候选接口后生成类型。 */
      action: "generate-types";

      /** 重新生成时使用的明确文档来源。 */
      source: SwaggerSource;

      /** 可以交给用户或 AI 选择的生成候选项。 */
      candidates: GenerateTypesRecoveryCandidate[];

      /** 面向调用方解释下一步操作。 */
      message: string;
    }
  | {
      /** 恢复动作需要询问用户。 */
      action: "ask-user";

      /** 需要向用户展示的问题或说明。 */
      message: string;
    }
  | {
      /** 恢复动作要求停止自动调用。 */
      action: "stop";

      /** 说明不能继续自动恢复的原因。 */
      message: string;
    };

/** CLI 错误中供用户或 AI 直接采取行动的恢复建议。 */
export type CliErrorRecovery = {
  /** 调用方应执行的恢复动作。 */
  action: CliRecoveryAction;

  /** 面向用户解释下一步操作的简短说明。 */
  message: string;

  /** 可直接交给进程执行器的命令与参数列表。 */
  commands?: CliRecoveryCommand[];

  /** 需要调用方选择的相近 API 列表。 */
  candidates?: CliRecoveryCandidate[];

  /** 供 CLI 与 MCP 分别转换的统一语义恢复意图。 */
  intent?: RecoveryIntent;
};

/** CLI JSON 协议的成功响应。 */
export type CliProtocolSuccess<T> = {
  /** JSON 协议版本。 */
  schemaVersion: 1;

  /** 表示命令执行成功。 */
  ok: true;

  /** 实际执行的 CLI 命令。 */
  command: CliCommand;

  /** 命令返回的结构化数据。 */
  data: T;

  /** 未阻止命令成功的警告列表。 */
  warnings: CliProtocolWarning[];
};

/** CLI JSON 协议中的错误内容。 */
export type CliProtocolErrorDetail = {
  /** 供 AI 或脚本稳定判断错误类型的代码。 */
  code: CliErrorCode;

  /** 面向用户展示的错误说明。 */
  message: string;

  /** 与错误相关的可选结构化信息。 */
  details?: unknown;

  /** 可供用户或 AI 直接执行的修复建议。 */
  recovery?: CliErrorRecovery;
};

/** CLI JSON 协议的失败响应。 */
export type CliProtocolFailure = {
  /** JSON 协议版本。 */
  schemaVersion: 1;

  /** 表示命令执行失败。 */
  ok: false;

  /** 用户请求执行的命令；省略命令时为 gen。 */
  command: string;

  /** 可供程序稳定处理的错误内容。 */
  error: CliProtocolErrorDetail;
};

/** 携带稳定错误码和结构化详情的 CLI 错误。 */
export class CliProtocolError extends Error {
  /** 供 AI 或脚本判断错误类型的稳定代码。 */
  readonly code: CliErrorCode;

  /** 与错误相关的可选结构化信息。 */
  readonly details?: unknown;

  /** 可供用户或 AI 直接执行的修复建议。 */
  readonly recovery?: CliErrorRecovery;

  constructor(
    code: CliErrorCode,
    message: string,
    details?: unknown,
    recovery?: CliErrorRecovery,
  ) {
    super(message);
    this.name = "CliProtocolError";
    this.code = code;
    this.details = details;
    this.recovery = recovery;
  }
}

/** CLI 与 MCP 共用的结构化输出协议版本。 */
export const PROTOCOL_SCHEMA_VERSION = 1 as const;

/** 创建不执行任何输出操作的 CLI 成功协议对象。 */
export function createProtocolSuccess<T>(
  command: CliCommand,
  data: T,
  warnings: CliProtocolWarning[] = [],
): CliProtocolSuccess<T> {
  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    ok: true,
    command,
    data,
    warnings,
  };
}

/** 将任意 CLI 异常转换为包含稳定错误码的协议错误。 */
export function normalizeProtocolError(error: unknown): CliProtocolError {
  if (error instanceof CliProtocolError) return error;

  const message = error instanceof Error ? error.message : String(error);
  if (/命令 services 已删除|未知命令/.test(message)) {
    return new CliProtocolError("INVALID_COMMAND", message);
  }
  if (/无法启动系统 Chrome/.test(message)) {
    return new CliProtocolError("CHROME_NOT_FOUND", message);
  }
  if (/请求超时|超时/.test(message)) {
    return new CliProtocolError("SOURCE_TIMEOUT", message);
  }
  if (/无法识别接口文档来源/.test(message)) {
    return new CliProtocolError("SOURCE_TYPE_UNKNOWN", message, undefined, {
      action: "retry",
      message: "请确认该地址是否为准确的接口文档地址。",
      intent: {
        action: "ask-user",
        message: "请用户确认该地址是否为准确的接口文档地址。",
      },
    });
  }
  if (/不是有效的 OpenAPI\/Swagger JSON/.test(message)) {
    return new CliProtocolError("OPENAPI_INVALID", message);
  }
  if (/不是有效的 swagger-config JSON/.test(message)) {
    return new CliProtocolError("SWAGGER_CONFIG_INVALID", message);
  }
  if (/未找到服务|未找到文档|没有可用服务/.test(message)) {
    return new CliProtocolError("SERVICE_NOT_FOUND", message);
  }
  if (/加载服务/.test(message)) {
    return new CliProtocolError("SERVICE_LOAD_FAILED", message);
  }
  if (/未找到 API|未找到可用 API/.test(message)) {
    return new CliProtocolError("API_NOT_FOUND", message);
  }
  if (/多个服务中存在 API/.test(message)) {
    return new CliProtocolError("AMBIGUOUS_API", message);
  }
  if (/复制到剪贴板失败/.test(message)) {
    return new CliProtocolError("CLIPBOARD_FAILED", message);
  }
  if (
    /参数|--type|--url|--method|--path|--keyword|--format|--limit|来源配置|缺少来源|配置已删除/.test(
      message,
    )
  ) {
    return new CliProtocolError("INVALID_ARGUMENT", message);
  }
  if (/HTTP \d+|页面已加载|读取 .*失败|fetch failed|ECONNREFUSED|ENOTFOUND|网络连接失败/.test(message)) {
    return new CliProtocolError("SOURCE_LOAD_FAILED", message);
  }
  return new CliProtocolError("UNKNOWN_ERROR", message);
}

/** 创建不执行任何输出操作的 CLI 失败协议对象。 */
export function createProtocolFailure(command: string, error: unknown): CliProtocolFailure {
  const normalizedError = normalizeProtocolError(error);
  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    ok: false,
    command,
    error: {
      code: normalizedError.code,
      message: normalizedError.message,
      ...(normalizedError.details === undefined ? {} : { details: normalizedError.details }),
      ...(normalizedError.recovery === undefined
        ? {}
        : { recovery: normalizedError.recovery }),
    },
  };
}
