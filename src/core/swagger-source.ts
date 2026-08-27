import {
  loadOpenApiDocumentFromUrl,
  loadSwaggerConfigFromUrl,
  normalizeBaseUrl,
  type OpenApiDocument,
  type SwaggerConfig,
} from "./swagger-loader.js";

/**
 * Swagger 文档来源类型。
 *
 * - `ui`：加载 Swagger UI 或 Knife4j 页面并观察真实网络响应。
 * - `openapi`：直接读取 OpenAPI 或 Swagger JSON。
 * - `config`：直接读取 swagger-config JSON。
 */
export type SwaggerSourceType = "ui" | "openapi" | "config";

/** Swagger 文档来源。 */
export type SwaggerSource = {
  /** 来源的读取方式。 */
  type: SwaggerSourceType;

  /** 用户明确提供的来源地址。 */
  url: string;
};

/** 已捕获并验证的 OpenAPI 文档。 */
export type CapturedOpenApiDocument = {
  /** 文档响应的最终地址。 */
  documentUrl: string;

  /** 已解析的 OpenAPI 文档。 */
  document: OpenApiDocument;

  /** 用于交互选择的文档标题。 */
  title: string;
};

/** Swagger 来源解析结果。 */
export type ResolvedSwaggerSource =
  | {
      /** 来源包含一个或多个 OpenAPI 文档。 */
      kind: "openapi";

      /** 已捕获的 OpenAPI 文档列表。 */
      documents: CapturedOpenApiDocument[];
    }
  | {
      /** 来源包含 swagger-config。 */
      kind: "swagger-config";

      /** swagger-config 响应地址。 */
      configUrl: string;

      /** 已规范化的 Swagger 服务配置。 */
      config: SwaggerConfig;

      /** 页面加载时同时捕获到的 OpenAPI 文档。 */
      capturedDocuments: CapturedOpenApiDocument[];
    };

/** 来源解析过程使用的运行参数。 */
export type ResolveSwaggerSourceOptions = {
  /** HTTP 请求和浏览器发现的超时时间。 */
  timeoutMs: number;

  /** 用户显式指定的系统 Chrome 路径。 */
  chromePath?: string;
};

const SOURCE_TYPES: SwaggerSourceType[] = ["ui", "openapi", "config"];

/** 校验并返回 Swagger 来源类型。 */
export function ensureSwaggerSourceType(value: string): SwaggerSourceType {
  const normalized = String(value || "").trim().toLowerCase();
  if (!SOURCE_TYPES.includes(normalized as SwaggerSourceType)) {
    throw new Error(`无效的 --type "${value}"。可选值: ${SOURCE_TYPES.join(", ")}`);
  }
  return normalized as SwaggerSourceType;
}

/** 创建已验证 OpenAPI 文档的统一描述。 */
export function createCapturedOpenApiDocument(
  documentUrl: string,
  document: OpenApiDocument,
): CapturedOpenApiDocument {
  const title = String(document.info?.title || "").trim() || "default";
  return { documentUrl, document, title };
}

/** 按用户明确选择的类型加载 Swagger 来源。 */
export async function loadSwaggerSource(
  source: SwaggerSource,
  options: ResolveSwaggerSourceOptions,
): Promise<ResolvedSwaggerSource> {
  const normalizedSource = { ...source, url: normalizeBaseUrl(source.url) };

  if (normalizedSource.type === "ui") {
    const { discoverOpenApiFromBrowser } = await import("./browser-openapi-discovery.js");
    return discoverOpenApiFromBrowser(normalizedSource.url, options);
  }

  if (normalizedSource.type === "openapi") {
    const document = await loadOpenApiDocumentFromUrl(normalizedSource.url, options.timeoutMs);
    return {
      kind: "openapi",
      documents: [createCapturedOpenApiDocument(normalizedSource.url, document)],
    };
  }

  const config = await loadSwaggerConfigFromUrl(normalizedSource.url, options.timeoutMs);
  return {
    kind: "swagger-config",
    configUrl: normalizedSource.url,
    config,
    capturedDocuments: [],
  };
}
