import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import {
  createSwaggerCommandContext,
  generateSwaggerTypes,
  searchSwaggerApis,
  type SwaggerCommandSettings,
} from "../application/swagger-commands.js";
import type { GeneratorOptions } from "../core/swagger-to-ts.js";
import { CliProtocolError, createProtocolFailure } from "../cli/protocol.js";
import { readPackageVersion } from "../package-metadata.js";

/**
 * MCP 工具支持的 Swagger 来源类型。
 *
 * - `page`：加载 Swagger UI 或 Knife4j 接口文档页面产生的真实网络响应。
 * - `openapi`：直接读取 OpenAPI 或 Swagger JSON。
 * - `config`：直接读取 swagger-config JSON。
 */
export type McpSwaggerSourceType = "page" | "openapi" | "config";

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

  /** 是否立即向服务端重新校验本地缓存。 */
  refresh?: boolean;

  /** 来源请求和页面发现的超时时间。 */
  timeoutMs?: number;

  /** page 来源使用的系统 Chrome 可执行文件路径。 */
  chromePath?: string;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const OPENAPI_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_SEARCH_LIMIT = 20;

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
    .enum(["page", "openapi", "config"])
    .describe("来源读取方式：page=接口文档页面，openapi=OpenAPI JSON，config=多服务配置 JSON"),
  url: z
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "来源地址只支持 http 或 https")
    .describe("用户明确提供的接口文档页面、OpenAPI JSON 或 swagger-config 地址"),
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
  recovery: z.unknown().optional(),
});

const searchOutputSchema = {
  ok: z.boolean().describe("工具是否执行成功"),
  data: searchDataSchema.optional().describe("搜索成功后的结构化数据"),
  warnings: z.array(warningSchema).optional().describe("不阻断搜索成功的警告"),
  error: errorSchema.optional().describe("搜索失败后的稳定错误"),
};

const generateOutputSchema = {
  ok: z.boolean().describe("工具是否执行成功"),
  data: generateDataSchema.optional().describe("生成成功后的结构化数据"),
  warnings: z.array(warningSchema).optional().describe("不阻断生成成功的警告"),
  error: errorSchema.optional().describe("生成失败后的稳定错误"),
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

function validateToolSource(source: McpSwaggerSource, chromePath?: string): void {
  const sourceType = String(source.type);
  if (!["page", "openapi", "config"].includes(sourceType)) {
    throw new CliProtocolError(
      "INVALID_ARGUMENT",
      `无效的来源类型 "${sourceType}"。可选值: page, openapi, config`,
      { sourceType, allowedValues: ["page", "openapi", "config"] },
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

/** 执行 search_apis，不依赖 MCP 传输层，便于契约测试和其他适配器复用。 */
export async function executeSearchApisTool(input: SearchApisToolInput) {
  try {
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
    const structuredContent = {
      ok: true as const,
      data: result.data,
      warnings: result.warnings,
    };
    return {
      content: [{ type: "text" as const, text: createToolText(structuredContent) }],
      structuredContent,
    };
  } catch (error) {
    const structuredContent = {
      ok: false as const,
      error: createProtocolFailure("search", error).error,
    };
    return {
      content: [{ type: "text" as const, text: createToolText(structuredContent) }],
      structuredContent,
      isError: true,
    };
  }
}

/** 执行 generate_typescript，不依赖 MCP 传输层，便于契约测试和其他适配器复用。 */
export async function executeGenerateTypescriptTool(input: GenerateTypescriptToolInput) {
  try {
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
    const structuredContent = {
      ok: true as const,
      data,
      warnings: [],
    };
    return {
      content: [{ type: "text" as const, text: createToolText(structuredContent) }],
      structuredContent,
    };
  } catch (error) {
    const structuredContent = {
      ok: false as const,
      error: createProtocolFailure("gen", error).error,
    };
    return {
      content: [{ type: "text" as const, text: createToolText(structuredContent) }],
      structuredContent,
      isError: true,
    };
  }
}

/** 创建已经注册 APITypeGen 工具的 MCP Server。 */
export function createApiTypeGenMcpServer(): McpServer {
  const server = new McpServer({
    name: "apitypegen",
    version: readPackageVersion(),
  });

  server.registerTool(
    "search_apis",
    {
      title: "搜索 OpenAPI 接口",
      description:
        "从用户明确提供的 OpenAPI JSON、多服务配置 JSON 或接口文档页面（Swagger UI / Knife4j）中搜索接口。返回精确 selector，适合随后调用 generate_typescript。不会猜测任何文档地址。",
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
    executeSearchApisTool,
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
