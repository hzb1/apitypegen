import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isOpenApiLike,
  parseJsonResponse,
  type OpenApiDocument,
} from "./swagger-loader.js";

/**
 * OpenAPI 文档缓存的读取状态。
 *
 * - `hit`：缓存仍在有效期内，未发起网络请求。
 * - `validated`：缓存已通过 ETag 或 Last-Modified 条件请求确认仍然有效。
 * - `miss`：本地没有有效缓存，已从网络完整加载。
 * - `refreshed`：已有缓存过期或被强制刷新，已从网络获取新内容。
 */
export type OpenApiCacheStatus = "hit" | "validated" | "miss" | "refreshed";

/** OpenAPI 文档缓存加载参数。 */
export type OpenApiCacheOptions = {
  /** HTTP 请求超时时间。 */
  timeoutMs?: number;

  /** 缓存有效期；有效期内直接使用本地文档。 */
  ttlMs?: number;

  /** 是否跳过本地有效期并立即向服务端校验缓存。 */
  refresh?: boolean;

  /** 自定义缓存目录，主要用于测试或隔离运行环境。 */
  cacheDir?: string;
};

/** OpenAPI 文档缓存加载结果。 */
export type OpenApiCacheResult = {
  /** 已校验的 OpenAPI 文档。 */
  document: OpenApiDocument;

  /** 本次加载使用缓存或网络的状态。 */
  cacheStatus: OpenApiCacheStatus;
};

/** 写入本地磁盘的 OpenAPI 缓存内容。 */
type OpenApiCacheEntry = {
  /** 缓存文件结构版本。 */
  version: 1;

  /** 最近一次从缓存读取或向服务端确认的时间。 */
  cachedAt: number;

  /** 服务端返回的 ETag，用于后续条件请求。 */
  etag?: string;

  /** 服务端返回的 Last-Modified，用于后续条件请求。 */
  lastModified?: string;

  /** 已通过结构校验的 OpenAPI 文档。 */
  document: OpenApiDocument;
};

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15000;

/** 返回默认的 OpenAPI 文档缓存目录。 */
export function defaultOpenApiCacheDir(): string {
  const cacheRoot = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(cacheRoot, "apitypegen", "openapi");
}

function cacheFilePath(cacheDir: string, documentUrl: string): string {
  const cacheKey = createHash("sha256").update(documentUrl).digest("hex");
  return path.join(cacheDir, `${cacheKey}.json`);
}

function isCacheEntry(value: unknown): value is OpenApiCacheEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as OpenApiCacheEntry;
  return (
    entry.version === 1 &&
    Number.isFinite(entry.cachedAt) &&
    (entry.etag === undefined || typeof entry.etag === "string") &&
    (entry.lastModified === undefined || typeof entry.lastModified === "string") &&
    isOpenApiLike(entry.document)
  );
}

async function readCacheEntry(cachePath: string): Promise<OpenApiCacheEntry | undefined> {
  try {
    const content = await fsp.readFile(cachePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return isCacheEntry(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function writeCacheEntry(
  cacheDir: string,
  cachePath: string,
  entry: OpenApiCacheEntry,
): Promise<void> {
  try {
    await fsp.mkdir(cacheDir, { recursive: true, mode: 0o700 });
    await fsp.chmod(cacheDir, 0o700);
    await fsp.writeFile(cachePath, JSON.stringify(entry), { encoding: "utf8", mode: 0o600 });
    await fsp.chmod(cachePath, 0o600);
  } catch {
    // 缓存不可写不应阻止 OpenAPI 文档的正常使用。
  }
}

/** 使用本地缓存和 HTTP 条件请求加载 OpenAPI 文档。 */
export async function loadOpenApiDocumentWithCache(
  documentUrl: string,
  options: OpenApiCacheOptions = {},
): Promise<OpenApiCacheResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ttlMs = Math.max(0, options.ttlMs ?? DEFAULT_CACHE_TTL_MS);
  const cacheDir = options.cacheDir || defaultOpenApiCacheDir();
  const cachePath = cacheFilePath(cacheDir, documentUrl);
  const cachedEntry = await readCacheEntry(cachePath);

  if (
    cachedEntry &&
    !options.refresh &&
    Date.now() - cachedEntry.cachedAt <= ttlMs
  ) {
    return { document: cachedEntry.document, cacheStatus: "hit" };
  }

  const headers: Record<string, string> = {};
  if (cachedEntry?.etag) headers["If-None-Match"] = cachedEntry.etag;
  if (cachedEntry?.lastModified) headers["If-Modified-Since"] = cachedEntry.lastModified;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(documentUrl, { signal: controller.signal, headers });
    if (response.status === 304 && cachedEntry) {
      const validatedEntry: OpenApiCacheEntry = {
        ...cachedEntry,
        cachedAt: Date.now(),
      };
      await writeCacheEntry(cacheDir, cachePath, validatedEntry);
      return { document: validatedEntry.document, cacheStatus: "validated" };
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} (${response.statusText})`);
    }

    const document = await parseJsonResponse(response, documentUrl);
    if (!isOpenApiLike(document)) {
      throw new Error(`${documentUrl} 不是有效的 OpenAPI/Swagger JSON`);
    }

    const entry: OpenApiCacheEntry = {
      version: 1,
      cachedAt: Date.now(),
      etag: response.headers.get("etag") || undefined,
      lastModified: response.headers.get("last-modified") || undefined,
      document,
    };
    await writeCacheEntry(cacheDir, cachePath, entry);
    return {
      document,
      cacheStatus: cachedEntry ? "refreshed" : "miss",
    };
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
      throw new Error(`请求超时（${timeoutMs}ms）：${documentUrl}`);
    }
    if (error instanceof Error) throw error;
    throw new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}
