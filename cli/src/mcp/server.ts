import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import {
  createSwaggerCommandContext,
  generateSwaggerTypes,
  searchSwaggerApis,
  type SwaggerCommandSettings,
} from "../application/swagger-commands.js";
import { inspectSwaggerSource } from "../core/source-inspector.js";
import type { GeneratorOptions } from "../core/swagger-to-ts.js";
import {
  CliProtocolError,
  PROTOCOL_SCHEMA_VERSION,
  normalizeProtocolError,
  type RecoveryIntent,
} from "../cli/protocol.js";
import { readPackageVersion } from "../package-metadata.js";

/**
 * MCP 工具支持的 Swagger 来源类型。
 *
 * - `page`：加载 Swagger UI 或 Knife4j 接口文档页面产生的真实网络响应。
 * - `openapi`：直接读取 OpenAPI 或 Swagger JSON。
 * - `swagger-config`：读取包含一个或多个 OpenAPI 文档地址的多服务配置 JSON。
 */
export type McpSwaggerSourceType = "page" | "openapi" | "swagger-config";

/**
 * MCP 代码生成工具支持的 HTTP 方法。
 *
 * - `get`：读取资源。
 * - `post`：创建资源或提交操作。
 * - `put`：整体更新资源。
 * - `delete`：删除资源。
 * - `patch`：局部更新资源。
 */
export type McpApiMethod = "get" | "post" | "put" | "delete" | "patch";

/** MCP 工具使用的 Swagger 来源输入。 */
export type McpSwaggerSource = {
  /** 来源读取方式。 */
  type: McpSwaggerSourceType;

  /** 用户明确提供的来源地址。 */
  url: string;
};

/** inspect_source 工具的调用参数。 */
export type InspectSourceToolInput = {
  /** 用户明确提供、需要识别类型的接口文档地址。 */
  url: string;

  /** 来源请求的超时时间。 */
  timeoutMs?: number;
};

/** resolve_source 工具的调用参数。 */
export type ResolveSourceToolInput = {
  /** 用户已经提供的候选地址；存在时会在输入表单中作为上下文提示。 */
  url?: string;
};

/** search_apis 工具的调用参数。 */
export type SearchApisToolInput = {
  /** Swagger 或 OpenAPI 来源。 */
  source: McpSwaggerSource;

  /** 用于匹配接口路径、摘要、标签和描述的关键词。 */
  keyword: string;

  /** 只搜索指定服务；缺省时搜索全部服务。 */
  service?: string;

  /** 最多返回的匹配结果数量。 */
  limit?: number;

  /** 是否立即向服务端重新校验本地缓存。 */
  refresh?: boolean;

  /** 来源请求和页面发现的超时时间。 */
  timeoutMs?: number;

  /** page 来源使用的系统 Chrome 可执行文件路径。 */
  chromePath?: string;
};

/** generate_typescript 工具的调用参数。 */
export type GenerateTypescriptToolInput = {
  /** Swagger 或 OpenAPI 来源。 */
  source: McpSwaggerSource;

  /** API 所属服务；单文档或唯一 API 时可以省略。 */
  service?: string;

  /** API 使用的 HTTP 方法。 */
  method: McpApiMethod;

  /** API 在 OpenAPI 文档中的路径。 */
  path: string;

  /** 是否已经向用户展示并获得该接口的明确确认；缺省按未确认处理。 */
  confirmed?: boolean;

  /** 是否立即向服务端重新校验本地缓存。 */
  refresh?: boolean;

  /** 来源请求和页面发现的超时时间。 */
  timeoutMs?: number;

  /** page 来源使用的系统 Chrome 可执行文件路径。 */
  chromePath?: string;
};

/**
 * MCP 稳定协议中的工具名称。
 *
 * - `resolve_source`：通过用户输入提供地址并自动确认来源类型。
 * - `inspect_source`：识别来源类型。
 * - `search_apis`：搜索接口。
 * - `generate_typescript`：生成 TypeScript 类型。
 */
export type McpToolName =
  | "resolve_source"
  | "inspect_source"
  | "search_apis"
  | "generate_typescript";

/** MCP 恢复建议中的单次工具调用。 */
export type McpRecoveryToolCall = {
  /** 应继续调用的 MCP 工具名称。 */
  tool: McpToolName;

  /** 可直接传递给该工具的结构化参数。 */
  arguments: Record<string, unknown>;
};

/** MCP 恢复建议中的候选工具调用。 */
export type McpRecoveryCandidate = McpRecoveryToolCall & {
  /** 供 AI 或用户理解候选项用途的摘要。 */
  summary: string;
};

/**
 * MCP 错误中的下一步恢复动作。
 *
 * - `call_tool`：直接调用指定工具。
 * - `select_tool_call`：从候选工具调用中选择一个。
 * - `ask_user`：缺少可靠信息，应询问用户。
 * - `stop`：当前错误不应继续自动重试。
 */
export type McpRecovery =
  | {
      /** 恢复动作为直接调用工具。 */
      action: "call_tool";

      /** 解释为什么应执行该工具调用。 */
      message: string;

      /** 可直接执行的工具调用。 */
      next: McpRecoveryToolCall;
    }
  | {
      /** 恢复动作为选择候选工具调用。 */
      action: "select_tool_call";

      /** 解释候选项的选择目标。 */
      message: string;

      /** 可直接执行的候选工具调用列表。 */
      candidates: McpRecoveryCandidate[];
    }
  | {
      /** 恢复动作要求询问用户。 */
      action: "ask_user";

      /** 应向用户展示的问题或说明。 */
      message: string;
    }
  | {
      /** 恢复动作要求停止自动调用。 */
      action: "stop";

      /** 说明不能继续自动恢复的原因。 */
      message: string;
    };

const DEFAULT_TIMEOUT_MS = 15_000;
const OPENAPI_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_SEARCH_LIMIT = 20;

/** MCP 客户端可读取的服务级使用说明。 */
export const MCP_INSTRUCTIONS = `APITypeGen 用于从用户提供的接口文档地址查找 API 并生成 TypeScript 类型。所有接口查询、定位和类型生成都必须优先使用本 MCP 工具；不要打开 APITypeGen 网页或调用浏览器插件。
1. 用户没有明确的接口文档来源时，先调用 resolve_source；该工具只要求用户提供地址，服务端会自动识别来源类型。
2. 用户只提供 URL 但未说明类型时，也先调用 resolve_source，而不是让用户选择或猜测 OpenAPI 与 swagger-config。
3. resolve_source 返回 source 后，再调用 search_apis；已有明确 source.type 和 source.url 时可直接调用 search_apis。
4. search_apis 返回候选结果后，必须把 service、method、path、summary 展示给用户并请求确认。
5. 用户明确确认前，不得调用 generate_typescript；不得默认选择第一个结果或根据相似路径猜测。
6. 用户确认后，原样使用已确认的 selector 调用 generate_typescript，并传入 confirmed=true。
7. 不要猜测、拼接或探测 OpenAPI、swagger-config 地址。
8. 多服务来源默认加载全部服务；同名接口必须使用 selector.service 消除歧义。
9. 工具失败时优先遵循 error.recovery 中可直接调用的工具和参数；ask_user 时询问用户，stop 时停止重试。
10. 页面来源未捕获到文档时，若收到 Elicitation 请求，必须让用户补充实际 JSON 文档完整 URL；服务端会自动识别 OpenAPI 或 swagger-config，不要只总结失败后结束。
11. generate_typescript 只返回代码和结构化类型，不写入用户文件。`;

const DEFAULT_GENERATOR_OPTIONS: Required<GeneratorOptions> = {
  indent: 2,
  useInterface: true,
  addExport: true,
  semicolon: true,
  typeNameMapper: (rawName) => rawName,
  int64ToString: true,
  showExample: true,
};

const sourceSchema = z.object({
  type: z
    .enum(["page", "openapi", "swagger-config"])
    .describe(
      "来源读取方式：page=接口文档页面，openapi=OpenAPI JSON，swagger-config=多服务文档配置 JSON",
    ),
  url: z
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "来源地址只支持 http 或 https")
    .describe("用户明确提供的接口文档页面、OpenAPI JSON 或 swagger-config 地址"),
});

const inspectDataSchema = z.object({
  source: sourceSchema,
  resolvedUrl: z.string(),
  status: z.number().int(),
  contentType: z.string(),
  reason: z.string(),
});

const resolveSourceDataSchema = z.object({
  source: sourceSchema,
  resolvedUrl: z.string(),
  status: z.number().int(),
  contentType: z.string(),
  reason: z.string(),
});

const selectorSchema = z.object({
  service: z.string(),
  method: z.enum(["get", "post", "put", "delete", "patch"]),
  path: z.string(),
});

const serviceSchema = z.object({
  name: z.string(),
  url: z.string(),
});

const failureSchema = z.object({
  service: z.string(),
  documentUrl: z.string(),
  message: z.string(),
});

const warningSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

const apiItemSchema = z.object({
  key: z.string(),
  path: z.string(),
  method: z.enum(["get", "post", "put", "delete", "patch"]),
  summary: z.string(),
  description: z.string(),
  operationId: z.string(),
  tags: z.array(z.string()),
});

const searchDataSchema = z.object({
  host: z.string(),
  service: z.string().nullable(),
  services: z.array(serviceSchema),
  loadedServices: z.number().int().nonnegative(),
  failedServices: z.array(failureSchema),
  keyword: z.string(),
  total: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  confirmationRequired: z.literal(true),
  items: z.array(
    apiItemSchema.extend({
      service: z.string(),
      documentUrl: z.string(),
      selector: selectorSchema,
    }),
  ),
});

const generatedPartsSchema = z.object({
  queryParams: z.string(),
  requestBody: z.string(),
  responseData: z.string(),
  models: z.string(),
});

const generateDataSchema = z.object({
  host: z.string(),
  service: z.string().nullable(),
  documentUrl: z.string(),
  selector: selectorSchema,
  matchedApi: apiItemSchema,
  code: z.string(),
  parts: generatedPartsSchema,
});

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

const mcpToolCallSchema = z.object({
  tool: z.enum(["resolve_source", "inspect_source", "search_apis", "generate_typescript"]),
  arguments: z.record(z.string(), z.unknown()),
});

const mcpRecoverySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("call_tool"),
    message: z.string(),
    next: mcpToolCallSchema,
  }),
  z.object({
    action: z.literal("select_tool_call"),
    message: z.string(),
    candidates: z.array(
      mcpToolCallSchema.extend({
        summary: z.string(),
      }),
    ),
  }),
  z.object({
    action: z.literal("ask_user"),
    message: z.string(),
  }),
  z.object({
    action: z.literal("stop"),
    message: z.string(),
  }),
]);

const errorOutputSchema = errorSchema.extend({
  recovery: mcpRecoverySchema,
});

const inspectOutputSchema = {
  schemaVersion: z.literal(PROTOCOL_SCHEMA_VERSION).describe("稳定协议版本"),
  ok: z.boolean().describe("工具是否执行成功"),
  command: z.literal("inspect_source").describe("实际执行的 MCP 工具"),
  data: inspectDataSchema.optional().describe("来源识别成功后的结构化数据"),
  warnings: z.array(warningSchema).optional().describe("不阻断识别成功的警告"),
  error: errorOutputSchema.optional().describe("来源识别失败后的稳定错误"),
};

const resolveSourceOutputSchema = {
  schemaVersion: z.literal(PROTOCOL_SCHEMA_VERSION).describe("稳定协议版本"),
  ok: z.boolean().describe("工具是否执行成功"),
  command: z.literal("resolve_source").describe("实际执行的 MCP 工具"),
  data: resolveSourceDataSchema.optional().describe("来源确认成功后的结构化数据"),
  warnings: z.array(warningSchema).optional().describe("不阻断确认成功的警告"),
  error: errorOutputSchema.optional().describe("来源确认失败后的稳定错误"),
};

const searchOutputSchema = {
  schemaVersion: z.literal(PROTOCOL_SCHEMA_VERSION).describe("稳定协议版本"),
  ok: z.boolean().describe("工具是否执行成功"),
  command: z.literal("search_apis").describe("实际执行的 MCP 工具"),
  data: searchDataSchema.optional().describe("搜索成功后的结构化数据"),
  warnings: z.array(warningSchema).optional().describe("不阻断搜索成功的警告"),
  error: errorOutputSchema.optional().describe("搜索失败后的稳定错误"),
};

const generateOutputSchema = {
  schemaVersion: z.literal(PROTOCOL_SCHEMA_VERSION).describe("稳定协议版本"),
  ok: z.boolean().describe("工具是否执行成功"),
  command: z.literal("generate_typescript").describe("实际执行的 MCP 工具"),
  data: generateDataSchema.optional().describe("生成成功后的结构化数据"),
  warnings: z.array(warningSchema).optional().describe("不阻断生成成功的警告"),
  error: errorOutputSchema.optional().describe("生成失败后的稳定错误"),
};

function createSettings(input: {
  /** 是否立即重新校验缓存。 */
  refresh?: boolean;

  /** 请求超时时间。 */
  timeoutMs?: number;

  /** 系统 Chrome 可执行文件路径。 */
  chromePath?: string;
}): SwaggerCommandSettings {
  return {
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    chromePath: input.chromePath,
    generator: DEFAULT_GENERATOR_OPTIONS,
    cacheTtlMs: OPENAPI_CACHE_TTL_MS,
    refreshCache: input.refresh ?? false,
  };
}

function createToolText(structuredContent: object): string {
  return JSON.stringify(structuredContent, null, 2);
}

function createSourceUrlElicitationSchema(candidateUrl?: string) {
  return {
    type: "object" as const,
    properties: {
      url: {
        type: "string" as const,
        title: "接口文档地址",
        format: "uri" as const,
        description: "请输入完整且可访问的 URL，服务端将自动识别文档类型",
        ...(candidateUrl ? { default: candidateUrl } : {}),
      },
    },
    required: ["url"],
  };
}

function recoveryFromIntent(intent: RecoveryIntent): McpRecovery {
  if (
    (intent.action === "search-api" || intent.action === "generate-types") &&
    intent.source.url === "<source-url>"
  ) {
    return {
      action: "ask_user",
      message: "来源地址包含凭据或敏感查询参数，请用户重新提供可用于下一次工具调用的完整地址。",
    };
  }
  if (intent.action === "inspect-source") {
    return {
      action: "call_tool",
      message: intent.message,
      next: {
        tool: "inspect_source",
        arguments: { url: intent.url },
      },
    };
  }
  if (intent.action === "search-api") {
    return {
      action: "call_tool",
      message: intent.message,
      next: {
        tool: "search_apis",
        arguments: { source: intent.source, keyword: intent.keyword },
      },
    };
  }
  if (intent.action === "generate-types") {
    return {
      action: "select_tool_call",
      message: intent.message,
      candidates: intent.candidates.map((candidate) => ({
        summary: candidate.summary,
        tool: "generate_typescript",
        arguments: {
          source: intent.source,
          service: candidate.selector.service,
          method: candidate.selector.method,
          path: candidate.selector.path,
        },
      })),
    };
  }
  return {
    action: intent.action === "ask-user" ? "ask_user" : "stop",
    message: intent.message,
  };
}

function createMcpFailure(
  command: McpToolName,
  error: unknown,
  recoveryOverride?: McpRecovery,
) {
  const normalizedError = normalizeProtocolError(error);
  const recovery =
    recoveryOverride ??
    (normalizedError.recovery?.intent
      ? recoveryFromIntent(normalizedError.recovery.intent)
      : {
          action: normalizedError.code === "INVALID_ARGUMENT" ? "ask_user" as const : "stop" as const,
          message:
            normalizedError.code === "INVALID_ARGUMENT"
              ? "请根据错误信息补充或修正工具参数。"
              : "当前错误没有可安全自动执行的恢复步骤，请检查来源可访问性后重试。",
        });
  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    ok: false as const,
    command,
    warnings: [],
    error: {
      code: normalizedError.code,
      message: normalizedError.message,
      ...(normalizedError.details === undefined ? {} : { details: normalizedError.details }),
      recovery,
    },
  };
}

function createMcpSuccess<T>(command: McpToolName, data: T, warnings: unknown[] = []) {
  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    ok: true as const,
    command,
    data,
    warnings,
  };
}

function validateToolSource(source: McpSwaggerSource, chromePath?: string): void {
  const sourceType = String(source.type);
  if (!["page", "openapi", "swagger-config"].includes(sourceType)) {
    throw new CliProtocolError(
      "INVALID_ARGUMENT",
      `无效的来源类型 "${sourceType}"。可选值: page, openapi, swagger-config`,
      { sourceType, allowedValues: ["page", "openapi", "swagger-config"] },
    );
  }
  if (!/^https?:\/\//i.test(source.url)) {
    throw new CliProtocolError("INVALID_ARGUMENT", "MCP 来源地址只支持 http 或 https", {
      sourceType: source.type,
    });
  }
  if (chromePath && source.type !== "page") {
    throw new CliProtocolError(
      "INVALID_ARGUMENT",
      "chromePath 仅能与 page 来源一起使用",
      { sourceType: source.type },
    );
  }
}

function ensureUserConfirmation(confirmed?: boolean): void {
  if (confirmed === true) return;
  throw new CliProtocolError(
    "CONFIRMATION_REQUIRED",
    "生成代码前必须先向用户展示并确认接口",
    { required: "confirmed", expected: true },
    {
      action: "retry",
      message: "请先向用户展示搜索结果并获得明确确认。",
      intent: {
        action: "ask-user",
        message: "请先向用户展示候选接口，并确认要生成的 service、method 和 path。",
      },
    },
  );
}

/** 执行 inspect_source，不依赖 MCP 传输层，便于契约测试和其他适配器复用。 */
export async function executeInspectSourceTool(input: InspectSourceToolInput) {
  try {
    const data = await inspectSwaggerSource(input.url, {
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    const structuredContent = createMcpSuccess("inspect_source", data);
    return {
      content: [{ type: "text" as const, text: createToolText(structuredContent) }],
      structuredContent,
    };
  } catch (error) {
    const structuredContent = createMcpFailure("inspect_source", error);
    return {
      content: [{ type: "text" as const, text: createToolText(structuredContent) }],
      structuredContent,
      isError: true,
    };
  }
}

function toToolResult(structuredContent: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: "text" as const, text: createToolText(structuredContent) }],
    structuredContent,
    ...(isError ? { isError: true } : {}),
  };
}

function isSourceRecoveryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /页面已加载，但未捕获到有效的 OpenAPI 或 swagger-config GET 响应|来源类型不匹配：当前地址返回 HTML 文档页面，不是 JSON/.test(
    message,
  );
}

function createCancelledSourceResult(command: McpToolName) {
  const structuredContent = createMcpFailure(
    command,
    new CliProtocolError("USER_INPUT_CANCELLED", "用户取消了接口文档来源输入"),
    {
      action: "stop",
      message: "请提供接口文档完整 URL 后重试，服务端会自动识别来源类型。",
    },
  );
  return toToolResult(structuredContent, true);
}

async function requestSourceElicitation(
  server: McpServer,
  pageRecovery = false,
  candidateUrl?: string,
) {
  const supportsForm = server.server.getClientCapabilities()?.elicitation?.form !== undefined;
  if (!supportsForm) return undefined;
  const urlResult = await server.server.elicitInput({
    mode: "form",
    message: pageRecovery
      ? "未能从 Swagger 页面捕获接口文档，请输入实际 JSON 文档完整 URL；服务端会自动识别类型。"
      : "请输入接口文档完整 URL；服务端会自动识别来源类型。",
    requestedSchema: createSourceUrlElicitationSchema(candidateUrl),
  });
  if (urlResult.action !== "accept" || !urlResult.content) return null;
  const parsedUrl = z
    .object({
      url: z.url().refine((value) => /^https?:\/\//i.test(value), "来源地址只支持 http 或 https"),
    })
    .safeParse(urlResult.content);
  if (!parsedUrl.success) {
    throw new CliProtocolError("INVALID_ARGUMENT", "用户输入的接口文档 URL 无效");
  }
  return { url: parsedUrl.data.url };
}

/** 执行 resolve_source，负责通过 MCP Elicitation 收集并确认来源。 */
export async function executeResolveSourceTool(
  input: ResolveSourceToolInput,
  server?: McpServer,
) {
  if (!server || server.server.getClientCapabilities()?.elicitation?.form === undefined) {
    const structuredContent = createMcpFailure(
      "resolve_source",
      new CliProtocolError(
        "INVALID_ARGUMENT",
        "当前 MCP 客户端不支持来源输入表单，请直接提供 source.type 和 source.url。",
      ),
      {
        action: "ask_user",
        message: "当前客户端不支持原生输入表单，请在下一次调用中直接提供 source.type 和完整 source.url。",
      },
    );
    return toToolResult(structuredContent, true);
  }
  try {
    const elicited = await requestSourceElicitation(server, false, input.url);
    if (!elicited) return createCancelledSourceResult("resolve_source");
    const inspection = await inspectSwaggerSource(elicited.url, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    return toToolResult(
      createMcpSuccess("resolve_source", {
        source: inspection.source,
        resolvedUrl: inspection.resolvedUrl,
        status: inspection.status,
        contentType: inspection.contentType,
        reason: inspection.reason,
      }),
    );
  } catch (error) {
    return toToolResult(createMcpFailure("resolve_source", error), true);
  }
}

/** 执行 search_apis，不依赖 MCP 传输层，便于契约测试和其他适配器复用。 */
export async function executeSearchApisTool(input: SearchApisToolInput) {
  try {
    return await executeSearchApisWithSource(input);
  } catch (error) {
    return toToolResult(createMcpFailure("search_apis", error), true);
  }
}

async function executeSearchApisWithSource(input: SearchApisToolInput) {
  validateToolSource(input.source, input.chromePath);
  const context = await createSwaggerCommandContext({
    source: input.source,
    settings: createSettings(input),
    service: input.service,
  });
  const result = searchSwaggerApis(context, {
    keyword: input.keyword,
    limit: input.limit ?? DEFAULT_SEARCH_LIMIT,
  });
  return toToolResult(
    createMcpSuccess("search_apis", result.data, result.warnings),
  );
}

async function executeSearchApisWithRecovery(input: SearchApisToolInput, server: McpServer) {
  try {
    return await executeSearchApisWithSource(input);
  } catch (error) {
    if (isSourceRecoveryError(error)) {
      try {
        const elicited = await requestSourceElicitation(server, true);
        if (elicited) {
          try {
            const inspection = await inspectSwaggerSource(elicited.url, {
              timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            });
            if (inspection.source.type === "page") {
              throw new CliProtocolError(
                "SOURCE_TYPE_UNKNOWN",
                "输入地址仍是 Swagger 页面，请提供页面实际加载的 JSON 文档地址。",
              );
            }
            return await executeSearchApisWithSource({
              ...input,
              source: inspection.source,
              chromePath: undefined,
            });
          } catch (retryError) {
            return toToolResult(createMcpFailure("search_apis", retryError), true);
          }
        }
        if (elicited === null) return createCancelledSourceResult("search_apis");
      } catch {
        // Elicitation 失败时继续返回原始页面发现错误和 fallback recovery。
      }
    }
    return toToolResult(createMcpFailure("search_apis", error), true);
  }
}

/** 执行 generate_typescript，不依赖 MCP 传输层，便于契约测试和其他适配器复用。 */
export async function executeGenerateTypescriptTool(input: GenerateTypescriptToolInput) {
  try {
    ensureUserConfirmation(input.confirmed);
    validateToolSource(input.source, input.chromePath);
    const context = await createSwaggerCommandContext({
      source: input.source,
      settings: createSettings(input),
      service: input.service,
    });
    const data = generateSwaggerTypes(context, {
      service: input.service,
      method: input.method,
      path: input.path,
    });
    const structuredContent = createMcpSuccess("generate_typescript", data);
    return {
      content: [{ type: "text" as const, text: createToolText(structuredContent) }],
      structuredContent,
    };
  } catch (error) {
    const structuredContent = createMcpFailure("generate_typescript", error);
    return {
      content: [{ type: "text" as const, text: createToolText(structuredContent) }],
      structuredContent,
      isError: true,
    };
  }
}

/** 创建已经注册 APITypeGen 工具的 MCP Server。 */
export function createApiTypeGenMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "apitypegen",
      version: readPackageVersion(),
    },
    { instructions: MCP_INSTRUCTIONS },
  );

  server.registerTool(
    "resolve_source",
    {
      title: "收集接口文档来源",
      description:
        "当用户没有明确提供 source.type 和 source.url 时，通过 MCP 输入表单收集完整 URL，并根据响应内容自动识别为 page、OpenAPI 或 Swagger Config。不要打开 APITypeGen 网页或调用浏览器插件；不会猜测或探测文档地址。",
      inputSchema: {
        url: z
          .url()
          .refine((value) => /^https?:\/\//i.test(value), "来源地址只支持 http 或 https")
          .optional()
          .describe("用户已经提供的候选地址；仅作为输入上下文，不会据此猜测类型"),
      },
      outputSchema: resolveSourceOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => executeResolveSourceTool(input, server),
  );

  server.registerTool(
    "inspect_source",
    {
      title: "识别接口文档来源",
      description:
        "通过 MCP 读取用户明确提供的单个 URL，并根据响应内容识别为 page、openapi 或 swagger-config。不要改用浏览器网页读取；不会拼接路径、扫描主机或探测候选地址。",
      inputSchema: {
        url: z
          .url()
          .refine((value) => /^https?:\/\//i.test(value), "来源地址只支持 http 或 https")
          .describe("用户明确提供、需要识别类型的接口文档地址"),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(120000)
          .optional()
          .describe("请求超时时间，单位毫秒"),
      },
      outputSchema: inspectOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    executeInspectSourceTool,
  );

  server.registerTool(
    "search_apis",
    {
      title: "搜索 OpenAPI 接口",
      description:
        "这是 APITypeGen 的主要接口查询与定位工具。通过 MCP 从用户明确提供的 OpenAPI JSON、多服务配置 JSON 或接口文档页面（Swagger UI / Knife4j）中搜索接口，返回精确 selector，适合随后调用 generate_typescript。不要打开 APITypeGen 网页或调用浏览器插件；不会猜测任何文档地址。",
      inputSchema: {
        source: sourceSchema,
        keyword: z.string().trim().min(1).describe("API 搜索关键词"),
        service: z.string().trim().min(1).optional().describe("可选服务名称过滤器"),
        limit: z.number().int().min(1).max(100).optional().describe("最多返回 1 到 100 条结果"),
        refresh: z.boolean().optional().describe("是否立即重新校验 OpenAPI 缓存"),
        timeoutMs: z.number().int().min(1000).max(120000).optional().describe("请求超时时间，单位毫秒"),
        chromePath: z.string().min(1).optional().describe("page 来源使用的系统 Chrome 路径"),
      },
      outputSchema: searchOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => executeSearchApisWithRecovery(input, server),
  );

  server.registerTool(
    "generate_typescript",
    {
      title: "生成 TypeScript API 类型",
      description:
        "根据精确的 HTTP 方法、路径和可选服务名生成 TypeScript 模型、查询参数、请求体与响应类型。只返回代码，不写文件、不访问剪贴板。",
      inputSchema: {
        source: sourceSchema,
        service: z.string().trim().min(1).optional().describe("API 所属服务名称"),
        method: z.enum(["get", "post", "put", "delete", "patch"]).describe("HTTP 方法"),
        path: z.string().trim().min(1).startsWith("/").describe("OpenAPI 路径"),
        confirmed: z
          .boolean()
          .optional()
          .default(false)
          .describe("用户已经确认 search_apis 返回的接口；缺省为未确认"),
        refresh: z.boolean().optional().describe("是否立即重新校验 OpenAPI 缓存"),
        timeoutMs: z.number().int().min(1000).max(120000).optional().describe("请求超时时间，单位毫秒"),
        chromePath: z.string().min(1).optional().describe("page 来源使用的系统 Chrome 路径"),
      },
      outputSchema: generateOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    executeGenerateTypescriptTool,
  );

  return server;
}

/** 通过 stdio 启动 APITypeGen MCP Server。 */
export async function startMcpServer(): Promise<void> {
  const server = createApiTypeGenMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
