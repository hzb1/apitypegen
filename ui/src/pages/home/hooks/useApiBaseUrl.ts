import { useMemo } from "react";
import type { OpenAPI } from "openapi-types";

export function useApiBaseUrl(params: {
  documentData: OpenAPI.Document | null;
  normalizedDocInput: string;
}) {
  const { documentData, normalizedDocInput } = params;

  return useMemo(() => {
    if (!documentData) return "";

    const docRecord = documentData as Record<string, unknown>;
    // OpenAPI v3 优先使用 servers；相对 server URL 需要基于文档 URL 解析。
    const serverList = docRecord.servers as Array<{url?: string}> | undefined;
    const serverUrl = serverList?.find((item) => typeof item?.url === "string" && item.url.trim())?.url?.trim();
    if (serverUrl) {
      try {
        const resolved = /^https?:\/\//.test(serverUrl)
          ? serverUrl
          : normalizedDocInput
            ? new URL(serverUrl, normalizedDocInput).toString()
            : serverUrl;
        return resolved.replace(/\/+$/, "");
      } catch {
        // ignore and fallback
      }
    }

    // Swagger v2 使用 host/basePath/schemes 组合出接口 baseUrl。
    const host = typeof docRecord.host === "string" ? docRecord.host.trim() : "";
    if (host) {
      const schemes = Array.isArray(docRecord.schemes)
        ? docRecord.schemes.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        : [];
      const basePath = typeof docRecord.basePath === "string" ? docRecord.basePath : "";
      const fallbackScheme = (() => {
        try {
          return normalizedDocInput ? new URL(normalizedDocInput).protocol.replace(":", "") : "http";
        } catch {
          return "http";
        }
      })();
      const scheme = schemes[0] || fallbackScheme;
      return `${scheme}://${host}${basePath}`.replace(/\/+$/, "");
    }

    // 文档没有声明接口服务器时，退回文档 URL 的 origin。
    try {
      return normalizedDocInput ? new URL(normalizedDocInput).origin : "";
    } catch {
      return "";
    }
  }, [documentData, normalizedDocInput]);
}
