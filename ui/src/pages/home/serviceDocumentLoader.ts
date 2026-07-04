import type { OpenAPI } from "openapi-types";
import { proxyFetch } from "@extension/src/shared/proxySdk.ts";

export function normalizeDocumentBaseUrl(rawInput: string) {
  const value = rawInput.trim();
  if (!value) return "";
  if (/^https?:\/\//.test(value)) return value;
  if (value.startsWith("/")) {
    return new URL(value, window.location.origin).toString();
  }
  return `http://${value}`;
}

export function buildServiceDocumentUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//.test(path)) return path;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase).toString();
}

function isOpenApiLike(doc: unknown): doc is OpenAPI.Document {
  if (!doc || typeof doc !== "object") return false;
  const typed = doc as Record<string, unknown>;
  return Boolean(typed.openapi || typed.swagger || typed.paths);
}

function shouldUseNativeFetch(url: string, pluginEnabled?: boolean) {
  try {
    if (new URL(url).origin === window.location.origin) return true;
  } catch {
    return true;
  }
  return !pluginEnabled;
}

export async function fetchOpenApiDocument(url: string, pluginEnabled?: boolean) {
  const response = shouldUseNativeFetch(url, pluginEnabled)
    ? await fetch(url)
    : await proxyFetch(url, { timeout: 10000 });
  if (!response.ok) {
    throw new Error(`加载 ${url} 失败：Status ${response.status}`);
  }
  const json = await response.json();
  if (!isOpenApiLike(json)) {
    throw new Error(`加载 ${url} 失败：文档格式不是 OpenAPI/Swagger`);
  }
  return json;
}
