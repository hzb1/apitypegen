/** Swagger 服务配置项。 */
export interface SwaggerServiceConfig {
  /** 服务的展示名称。 */
  name: string;

  /** 服务对应的 OpenAPI 文档地址。 */
  url: string;
}

/** Swagger UI 使用的文档来源配置。 */
export interface SwaggerConfig {
  /** 单文档模式使用的 OpenAPI 文档地址。 */
  url?: string;

  /** 多服务模式使用的 OpenAPI 服务列表。 */
  urls?: SwaggerServiceConfig[];

  /** Swagger UI 可能携带的其他配置字段。 */
  [key: string]: unknown;
}

/** CLI 支持读取的 OpenAPI 或 Swagger 文档结构。 */
export type OpenApiDocument = {
  /** OpenAPI 3.x 规范版本。 */
  openapi?: string;

  /** Swagger 2.x 规范版本。 */
  swagger?: string;

  /** 文档的基本信息。 */
  info?: {
    /** 文档标题。 */
    title?: string;

    /** 基本信息可能携带的其他字段。 */
    [key: string]: unknown;
  };

  /** 文档中的接口路径集合。 */
  paths?: Record<string, unknown>;

  /** OpenAPI 文档可能携带的其他字段。 */
  [key: string]: unknown;
};

/** 将用户输入规范化为带协议的 HTTP URL。 */
export function normalizeBaseUrl(rawInput: string): string {
  const value = String(rawInput || "").trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}

/** 判断未知值是否为结构完整的 OpenAPI 或 Swagger 文档。 */
export function isOpenApiLike(document: unknown): document is OpenApiDocument {
  if (!document || typeof document !== "object") return false;

  const typedDocument = document as OpenApiDocument;
  const hasVersion =
    typeof typedDocument.openapi === "string" || typeof typedDocument.swagger === "string";
  const hasPaths = Boolean(
    typedDocument.paths &&
      typeof typedDocument.paths === "object" &&
      !Array.isArray(typedDocument.paths),
  );

  return hasVersion && hasPaths;
}

/** 判断未知值是否为 Swagger UI 文档来源配置。 */
export function isSwaggerConfigLike(data: unknown): data is SwaggerConfig {
  if (!data || typeof data !== "object") return false;

  const config = data as SwaggerConfig;
  const hasSingleUrl = typeof config.url === "string" && config.url.trim() !== "";
  const hasServiceUrls =
    Array.isArray(config.urls) &&
    config.urls.some(
      (item) =>
        item &&
        typeof item.name === "string" &&
        item.name !== "" &&
        typeof item.url === "string" &&
        item.url !== "",
    );

  return hasSingleUrl || hasServiceUrls;
}

function isHtmlResponse(contentType: string, body: string): boolean {
  if (/\btext\/html\b/i.test(contentType)) return true;
  const prefix = body.trimStart().slice(0, 256);
  return /^(?:<!doctype\s+html\b|<html\b)/i.test(prefix);
}

/** 读取 HTTP 响应，并在 HTML 被误作 JSON 时返回稳定的来源类型错误。 */
export async function parseJsonResponse<T = unknown>(
  response: Response,
  url: string,
): Promise<T> {
  const body = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (isHtmlResponse(contentType, body)) {
    throw new Error(`来源类型不匹配：当前地址返回 HTML 文档页面，不是 JSON：${url}`);
  }
  return JSON.parse(body) as T;
}

/** 使用超时控制请求并解析 JSON 响应。 */
export async function fetchJson<T = unknown>(url: string, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} (${response.statusText})`);
    }
    return await parseJsonResponse<T>(response, url);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
      throw new Error(`请求超时（${timeoutMs}ms）：${url}`);
    }
    if (error instanceof Error) throw error;
    throw new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}

/** 根据配置响应地址将服务文档地址规范化为绝对 URL。 */
export function normalizeSwaggerConfig(config: SwaggerConfig, configUrl: string): SwaggerConfig {
  if (Array.isArray(config.urls)) {
    return {
      ...config,
      urls: config.urls
        .filter(
          (item) =>
            item &&
            typeof item.name === "string" &&
            item.name !== "" &&
            typeof item.url === "string" &&
            item.url !== "",
        )
        .map((item) => ({
          name: item.name,
          url: new URL(item.url, configUrl).toString(),
        })),
    };
  }

  return {
    ...config,
    urls: config.url
      ? [
          {
            name: "default",
            url: new URL(config.url, configUrl).toString(),
          },
        ]
      : [],
  };
}

/** 从用户明确提供的 URL 加载 swagger-config。 */
export async function loadSwaggerConfigFromUrl(
  configUrl: string,
  timeoutMs = 15000,
): Promise<SwaggerConfig> {
  const config = await fetchJson<SwaggerConfig>(configUrl, timeoutMs);
  if (!isSwaggerConfigLike(config)) {
    throw new Error(`${configUrl} 不是有效的 swagger-config JSON`);
  }
  return normalizeSwaggerConfig(config, configUrl);
}

/** 按名称查找 Swagger 服务。 */
export function findService(
  config: SwaggerConfig,
  serviceName: string,
): SwaggerServiceConfig | undefined {
  if (!Array.isArray(config.urls)) return undefined;
  return config.urls.find((item) => String(item.name) === String(serviceName));
}

/** 从用户明确提供的 URL 加载 OpenAPI 文档。 */
export async function loadOpenApiDocumentFromUrl(
  documentUrl: string,
  timeoutMs = 15000,
): Promise<OpenApiDocument> {
  const document = await fetchJson<OpenApiDocument>(documentUrl, timeoutMs);
  if (!isOpenApiLike(document)) {
    throw new Error(`${documentUrl} 不是有效的 OpenAPI/Swagger JSON`);
  }
  return document;
}
