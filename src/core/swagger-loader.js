const DEFAULT_SWAGGER_CONFIG_CANDIDATES = [
  "/v3/api-docs/swagger-config",
  "/api-docs/swagger-config",
  "/swagger-config",
];

export function normalizeBaseUrl(rawInput) {
  const value = String(rawInput || "").trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}

export function joinUrl(baseUrl, path) {
  if (!path) return baseUrl;
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase).toString();
}

export function isLikelyDocumentUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase();
    if (pathname.endsWith(".json")) return true;
    return ["openapi", "swagger", "api-docs", "docs-json"].some((token) =>
      pathname.includes(token),
    );
  } catch {
    return false;
  }
}

export function isOpenApiLike(doc) {
  if (!doc || typeof doc !== "object") return false;
  return Boolean(doc.openapi || doc.swagger || doc.paths);
}

export async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} (${response.statusText})`);
    }
    return await response.json();
  } catch (error) {
    if (error && typeof error === "object" && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadSwaggerConfig(baseUrl, version = "v3", timeoutMs = 15000) {
  const firstCandidate = version ? `/${version}/api-docs/swagger-config` : undefined;
  const candidates = Array.from(
    new Set([firstCandidate, ...DEFAULT_SWAGGER_CONFIG_CANDIDATES].filter(Boolean)),
  );

  let lastError;
  for (const candidate of candidates) {
    const targetUrl = joinUrl(baseUrl, candidate);
    try {
      const parsed = await fetchJson(targetUrl, timeoutMs);
      if (parsed?.urls && Array.isArray(parsed.urls)) {
        return parsed;
      }
      lastError = new Error(`Invalid swagger-config format at ${targetUrl}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to load swagger-config from ${baseUrl}. Last error: ${lastError?.message || "unknown"}`,
  );
}

export function findService(config, serviceName) {
  if (!config?.urls || !Array.isArray(config.urls)) return undefined;
  return config.urls.find((item) => String(item?.name || "") === String(serviceName || ""));
}

export async function loadOpenApiDocumentFromUrl(docUrl, timeoutMs = 15000) {
  const document = await fetchJson(docUrl, timeoutMs);
  if (!isOpenApiLike(document)) {
    throw new Error(`Document at ${docUrl} is not a valid OpenAPI/Swagger document`);
  }
  return document;
}

export async function loadOpenApiDocumentByService({
  host,
  serviceUrl,
  timeoutMs = 15000,
}) {
  const baseUrl = normalizeBaseUrl(host);
  const documentUrl = joinUrl(baseUrl, serviceUrl);
  const document = await loadOpenApiDocumentFromUrl(documentUrl, timeoutMs);
  return { document, documentUrl };
}
