import {
  isOpenApiLike,
  isSwaggerConfigLike,
  normalizeBaseUrl,
} from "./swagger-loader.js";
import type { SwaggerSource, SwaggerSourceType } from "./swagger-source.js";

/** 来源识别允许读取的最大响应体大小。 */
const MAX_INSPECTION_BODY_BYTES = 25 * 1024 * 1024;

/** 来源识别请求使用的运行参数。 */
export type InspectSwaggerSourceOptions = {
  /** 请求超时时间，单位毫秒。 */
  timeoutMs: number;
};

/** 对用户明确提供的地址完成内容识别后的结果。 */
export type SwaggerSourceInspection = {
  /** 根据响应内容识别出的明确来源。 */
  source: SwaggerSource;

  /** 请求重定向后的最终响应地址。 */
  resolvedUrl: string;

  /** 来源地址返回的 HTTP 状态码。 */
  status: number;

  /** 来源地址返回的 Content-Type。 */
  contentType: string;

  /** 说明来源类型判定依据的简短文本。 */
  reason: string;
};

function isHtmlResponse(contentType: string, body: string): boolean {
  if (/\btext\/html\b/i.test(contentType)) return true;
  const normalizedBody = body.trimStart().slice(0, 256).toLowerCase();
  return normalizedBody.startsWith("<!doctype html") || normalizedBody.startsWith("<html");
}

function inspectionReason(type: SwaggerSourceType): string {
  if (type === "page") return "响应内容为 HTML 接口文档页面";
  if (type === "openapi") return "JSON 包含 OpenAPI 或 Swagger 版本字段以及 paths";
  return "JSON 包含一个或多个 OpenAPI 文档地址";
}

/**
 * 识别用户明确提供的单个 URL，不拼接路径，也不请求任何候选地址。
 */
export async function inspectSwaggerSource(
  rawUrl: string,
  options: InspectSwaggerSourceOptions,
): Promise<SwaggerSourceInspection> {
  const url = normalizeBaseUrl(rawUrl);
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("来源地址只支持 http 或 https");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} (${response.statusText})`);
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_INSPECTION_BODY_BYTES) {
      throw new Error(`来源响应超过 25 MiB：${url}`);
    }

    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_INSPECTION_BODY_BYTES) {
      throw new Error(`来源响应超过 25 MiB：${url}`);
    }

    const contentType = response.headers.get("content-type") || "";
    let type: SwaggerSourceType | undefined;
    if (isHtmlResponse(contentType, body)) {
      type = "page";
    } else {
      let value: unknown;
      try {
        value = JSON.parse(body) as unknown;
      } catch {
        throw new Error(`无法识别接口文档来源：响应既不是 HTML，也不是有效 JSON（${url}）`);
      }

      if (isOpenApiLike(value)) type = "openapi";
      else if (isSwaggerConfigLike(value)) type = "swagger-config";
    }

    if (!type) {
      throw new Error(
        `无法识别接口文档来源：JSON 不是 OpenAPI 或 swagger-config（${url}）`,
      );
    }

    return {
      source: { type, url },
      resolvedUrl: response.url || url,
      status: response.status,
      contentType,
      reason: inspectionReason(type),
    };
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
      throw new Error(`请求超时（${options.timeoutMs}ms）：${url}`);
    }
    if (error instanceof Error) throw error;
    throw new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}
