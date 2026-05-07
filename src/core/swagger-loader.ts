const DEFAULT_SWAGGER_CONFIG_CANDIDATES = [
  "/v3/api-docs/swagger-config",
  "/api-docs/swagger-config",
  "/swagger-config",
];

export interface SwaggerServiceConfig {
  name: string;
  url: string;
}

export interface SwaggerConfig {
  urls?: SwaggerServiceConfig[];
  [key: string]: unknown;
}

export type OpenApiDocument = {
  openapi?: string;
  swagger?: string;
  paths?: Record<string, unknown>;
  [key: string]: unknown;
};

export function normalizeBaseUrl(rawInput: string): string {
  const value = String(rawInput || "").trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}

export function joinUrl(baseUrl: string, nextPath: string): string {
  if (!nextPath) return baseUrl;
  if (/^https?:\/\//i.test(nextPath)) return nextPath;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = nextPath.startsWith("/") ? nextPath.slice(1) : nextPath;
  return new URL(normalizedPath, normalizedBase).toString();
}

export function isOpenApiLike(doc: unknown): doc is OpenApiDocument {
  if (!doc || typeof doc !== "object") return false;
  const typedDoc = doc as OpenApiDocument;
  return Boolean(typedDoc.openapi || typedDoc.swagger || typedDoc.paths);
}

export async function fetchJson<T = unknown>(url: string, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} (${response.statusText})`);
    }
    return (await response.json()) as T;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
      throw new Error(`请求超时（${timeoutMs}ms）：${url}`);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}

export async function loadSwaggerConfig(
  baseUrl: string,
  version = "v3",
  timeoutMs = 15000,
): Promise<SwaggerConfig> {
  const firstCandidate = version ? `/${version}/api-docs/swagger-config` : undefined;
  const candidates = Array.from(
    new Set([firstCandidate, ...DEFAULT_SWAGGER_CONFIG_CANDIDATES].filter(Boolean)),
  ) as string[];

  let lastError: Error | undefined;
  for (const candidate of candidates) {
    const targetUrl = joinUrl(baseUrl, candidate);
    try {
      const parsed = await fetchJson<SwaggerConfig>(targetUrl, timeoutMs);
      if (parsed?.urls && Array.isArray(parsed.urls)) {
        return parsed;
      }
      lastError = new Error(`swagger-config 格式无效：${targetUrl}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(
    `无法从 ${baseUrl} 加载 swagger-config。最后一次错误：${lastError?.message || "未知错误"}`,
  );
}

export function findService(config: SwaggerConfig, serviceName: string): SwaggerServiceConfig | undefined {
  if (!config?.urls || !Array.isArray(config.urls)) return undefined;
  return config.urls.find((item) => String(item?.name || "") === String(serviceName || ""));
}

export async function loadOpenApiDocumentFromUrl(
  docUrl: string,
  timeoutMs = 15000,
): Promise<OpenApiDocument> {
  const document = await fetchJson<OpenApiDocument>(docUrl, timeoutMs);
  if (!isOpenApiLike(document)) {
    throw new Error(`文档不是有效的 OpenAPI/Swagger：${docUrl}`);
  }
  return document;
}

export async function loadOpenApiDocumentByService({
  host,
  serviceUrl,
  timeoutMs = 15000,
}: {
  host: string;
  serviceUrl: string;
  timeoutMs?: number;
}): Promise<{ document: OpenApiDocument; documentUrl: string }> {
  const baseUrl = normalizeBaseUrl(host);
  const documentUrl = joinUrl(baseUrl, serviceUrl);
  const document = await loadOpenApiDocumentFromUrl(documentUrl, timeoutMs);
  return { document, documentUrl };
}
