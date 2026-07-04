import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { OpenAPI } from "openapi-types";
import { proxyFetch } from "@extension/src/shared/proxySdk.ts";
import { ProxyError } from "@extension/src/shared/types.ts";
import {
  requestDebugStore,
  type RequestDebugSource,
  type RequestDebugStage,
} from "@/debug/requestDebugStore.ts";

/* -------------------------------------------------------------------------- */
/* types                                    */
/* -------------------------------------------------------------------------- */

const DEFAULT_SWAGGER_CONFIG_CANDIDATES = [
  "/v3/api-docs/swagger-config",
  "/api-docs/swagger-config",
  "/swagger-config",
];

export type SwaggerLoadingStage = "idle" | "probe" | "config" | "document";

type SwaggerConfig = {
  urls: { name: string; url: string }[];
};

type State = {
  config: SwaggerConfig | null;
  document: OpenAPI.Document | null;
  directConfigUrl: string | null;
  // 当前 document 是用哪个 serviceUrl 加载的，用于在 service 切换时同步判定"文档已过期"。
  documentServiceUrl: string | undefined;
  stage: SwaggerLoadingStage;
  error: SwaggerErrorDetail | null;
};

type Action =
  | { type: "PROBE" }
  | { type: "LOAD_CONFIG" }
  | { type: "LOAD_DOCUMENT" }
  | { type: "LOAD_DIRECT_DOCUMENT" }
  | { type: "CONFIG_SUCCESS"; payload: SwaggerConfig; directConfigUrl?: string }
  | { type: "DOCUMENT_SUCCESS"; payload: OpenAPI.Document; serviceUrl?: string }
  | { type: "ERROR"; payload: SwaggerErrorDetail }
  | { type: "CLEAR_ERROR" };

export type SwaggerErrorDetail = {
  message: string;
  reason?: string;
  tips?: string[];
  requiresExtension?: boolean;
};

export type UseSwaggerOptions = {
  // 当配置加载完成，且发现 URL 缺少 service 时，建议 UI 层补全 URL
  onAutoSelectService?: (defaultServiceUrl: string) => void;
  // 新增回调：当文档加载成功时触发
  onDocumentLoaded?: (doc: OpenAPI.Document) => void;
  // swagger-config 模式下是否由 useSwagger 自动加载当前 service 文档。
  loadServiceDocument?: boolean;
};

export type SwaggerFetchMode = "auto" | "native" | "proxy";

/* -------------------------------------------------------------------------- */
/* reducer                                   */
/* -------------------------------------------------------------------------- */

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "PROBE":
      return { ...state, config: null, document: null, directConfigUrl: null, stage: "probe", error: null };
    case "LOAD_CONFIG":
      return { ...state, config: null, document: null, directConfigUrl: null, stage: "config", error: null }; //
    case "LOAD_DOCUMENT":
      return { ...state, document: null, stage: "document", error: null }; //
    case "LOAD_DIRECT_DOCUMENT":
      return { ...state, config: null, document: null, directConfigUrl: null, stage: "document", error: null };
    case "CONFIG_SUCCESS":
      return { ...state, config: action.payload, directConfigUrl: action.directConfigUrl ?? null, stage: "idle", error: null }; //
    case "DOCUMENT_SUCCESS":
      return { ...state, document: action.payload, documentServiceUrl: action.serviceUrl, stage: "idle", error: null }; //
    case "ERROR":
      return { ...state, stage: "idle", error: action.payload }; //
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/* utils                                       */
/* -------------------------------------------------------------------------- */

function normalizeBaseUrl(rawInput: string) {
  const v = rawInput.trim();
  if (!v) return "";
  if (/^https?:\/\//.test(v)) return v;
  if (v.startsWith("/")) {
    return new URL(v, window.location.origin).toString();
  }
  return `http://${v}`; //
}

function joinUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return new URL(path, baseUrl).toString();
}

function isLikelyDocumentUrl(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase();
    if (pathname.endsWith(".json")) return true;
    if (/\/docs\/json\/?$/.test(pathname)) return true;
    return ["openapi", "swagger", "api-docs", "docs-json"].some((token) =>
      pathname.includes(token),
    );
  } catch {
    return false;
  }
}

function isOpenApiLike(doc: unknown): doc is OpenAPI.Document {
  if (!doc || typeof doc !== "object") return false;
  const typed = doc as Record<string, unknown>;
  return Boolean(typed.openapi || typed.swagger || typed.paths);
}

function isSwaggerConfigLike(doc: unknown): doc is SwaggerConfig {
  if (!doc || typeof doc !== "object") return false;
  const typed = doc as Record<string, unknown>;
  return Array.isArray(typed.urls)
    && typed.urls.some((item) => {
      if (!item || typeof item !== "object") return false;
      const record = item as Record<string, unknown>;
      return typeof record.url === "string" && record.url.trim().length > 0;
    });
}

function createRequestKey(parts: Array<string | number | boolean | undefined>) {
  return parts.map((part) => String(part ?? "")).join("|");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function getAbortReason(signal: AbortSignal, fallback: string) {
  if (signal.reason instanceof DOMException && signal.reason.message) {
    return signal.reason.message;
  }
  return typeof signal.reason === "string" ? signal.reason : fallback;
}

/* -------------------------------------------------------------------------- */
/* hook                                     */
/* -------------------------------------------------------------------------- */

export function useSwagger(params: {
  docOrHost?: string;
  ip: string;
  serviceUrl?: string;
  version?: string;
  reloadKey?: number;
  fetchMode?: SwaggerFetchMode;
  extensionAvailable?: boolean;
  options?: UseSwaggerOptions;
}) {
  const {
    docOrHost,
    ip,
    serviceUrl,
    version = "v3",
    reloadKey = 0,
    fetchMode = "auto",
    extensionAvailable,
    options,
  } = params;
  const input = docOrHost ?? ip;

  const [state, dispatch] = useReducer(reducer, {
    config: null,
    document: null,
    directConfigUrl: null,
    documentServiceUrl: undefined,
    stage: "idle",
    error: null,
  });

  // 使用 Ref 记录请求 ID，防止竞态条件
  const configRequestIdRef = useRef(0);
  const docRequestIdRef = useRef(0);
  const hasResolvedDocumentRef = useRef(false);
  const optionsRef = useRef(options);
  const serviceUrlRef = useRef(serviceUrl);
  const activeAbortRef = useRef<AbortController | null>(null);
  const shouldLoadServiceDocument = options?.loadServiceDocument ?? true;

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    serviceUrlRef.current = serviceUrl;
  }, [serviceUrl]);

  const cancelActiveRequest = useCallback((reason: string) => {
    const controller = activeAbortRef.current;
    if (!controller || controller.signal.aborted) return;
    controller.abort(new DOMException(reason, "AbortError"));
    activeAbortRef.current = null;
  }, []);

  const createRequestController = useCallback((reason: string) => {
    cancelActiveRequest(reason);
    const controller = new AbortController();
    activeAbortRef.current = controller;
    return controller;
  }, [cancelActiveRequest]);

  const clearActiveController = useCallback((controller: AbortController) => {
    if (activeAbortRef.current === controller) {
      activeAbortRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      cancelActiveRequest("component unmounted");
    },
    [cancelActiveRequest],
  );

  const normalizedInput = useMemo(() => normalizeBaseUrl(input), [input]);
  const isSameOriginInput = useMemo(() => {
    try {
      return new URL(normalizedInput).origin === window.location.origin;
    } catch {
      return false;
    }
  }, [normalizedInput]);
  const directDocumentMode = useMemo(
    () => isLikelyDocumentUrl(normalizedInput),
    [normalizedInput],
  );
  const shouldUseNativeFetch = useMemo(() => {
    if (fetchMode === "native") return true;
    if (fetchMode === "proxy") return false;
    if (isSameOriginInput) return true;
    return extensionAvailable === false;
  }, [extensionAvailable, fetchMode, isSameOriginInput]);

  /**
   * 辅助：统一错误处理
   */
  const handleError = useCallback((err: unknown, defaultMsg: string, usedNativeFetch: boolean) => {
    let detail: SwaggerErrorDetail = { message: defaultMsg };
    const failedWithoutProxy = usedNativeFetch && !isSameOriginInput;

    if (failedWithoutProxy && err instanceof TypeError) {
      detail = {
        message: "浏览器无法直接读取该文档地址，可能需要扩展代理",
        reason: "目标地址可能是跨域、内网服务、证书异常，或没有允许浏览器直接访问的 CORS 响应头。",
        tips: [
          "如果只是体验产品，可以先点击“试用示例项目”。",
          "如果这是内网或跨域 Swagger，请安装浏览器扩展后点击“重新检测”。",
          "同源文档或已允许 CORS 的 OpenAPI/Swagger JSON 不需要扩展。",
        ],
        requiresExtension: true,
      };
      dispatch({ type: "ERROR", payload: detail });
      return;
    }

    if (err instanceof ProxyError) {
      switch (err.type) {
        case 'NETWORK_ERROR':
          detail = {
            message: '扩展代理请求失败',
            reason: err.message || '网络连接失败，请检查文档地址、HTTPS 证书或浏览器扩展',
            tips: [
              "确认目标 Swagger 地址可以从当前网络访问。",
              "确认浏览器扩展已安装、启用，并刷新页面后重试。",
            ],
            requiresExtension: true,
          };
          break;
        case 'TIMEOUT':
          detail = {
            message: '请求超时',
            reason: '目标服务响应过慢，或扩展代理无法在限定时间内完成请求。',
            tips: ["检查服务地址是否可访问，或稍后重试。"],
            requiresExtension: true,
          };
          break;
        default:
          detail = {
            message: err.message,
            reason: defaultMsg,
            tips: ["检查文档地址是否正确，或安装/启用扩展后重试。"],
            requiresExtension: true,
          };
      }
    } else if (err instanceof TypeError) {
      detail = {
        message: '网络连接失败',
        reason: '浏览器无法完成请求，请检查文档地址、HTTPS 证书或 CORS 配置。',
        tips: [
          "同源或已开启 CORS 的文档可以直接加载。",
          "跨域或内网文档通常需要安装浏览器扩展。",
        ],
        requiresExtension: true,
      };
    } else if (err instanceof Error && err.message) {
      detail = {
        message: `${defaultMsg}：${err.message}`,
        reason: "目标地址返回异常，或不是可识别的 OpenAPI/Swagger 文档。",
        tips: ["确认地址能直接返回 JSON 文档，或输入服务根地址让系统探测 swagger-config。"],
      };
    }
    dispatch({ type: "ERROR", payload: detail });
  }, [isSameOriginInput]);

  const fetchType = shouldUseNativeFetch ? "native" : "proxy";

  const fetchJson = useCallback(async (
    url: string,
    meta: {
      stage: RequestDebugStage;
      source: RequestDebugSource;
      reason: string;
      requestKey: string;
    },
    signal: AbortSignal,
  ) => {
    const traceId = requestDebugStore.recordRequestStart({
      url,
      method: "GET",
      stage: meta.stage,
      source: meta.source,
      reason: meta.reason,
      requestKey: meta.requestKey,
      fetchType,
    });

    try {
      const res = shouldUseNativeFetch
        ? await fetch(url, { signal })
        : await proxyFetch(url, {
            timeout: 10000,
            signal,
            debugMeta: {
              initiator: meta.source,
              requestKey: meta.requestKey,
            },
          });
      if (!res.ok) throw new Error(`Status: ${res.status}`);
      const json = await res.json();
      requestDebugStore.recordRequestSuccess(traceId, res.status);
      return json;
    } catch (error) {
      if (isAbortError(error)) {
        requestDebugStore.recordRequestCancelled(
          traceId,
          getAbortReason(signal, "request aborted"),
        );
      } else {
        requestDebugStore.recordRequestError(traceId, error);
      }
      throw error;
    }
  }, [fetchType, shouldUseNativeFetch]);

  const loadDirectDocument = useCallback(async (baseUrl: string, rid: number, signal: AbortSignal) => {
    dispatch({ type: "LOAD_DIRECT_DOCUMENT" });
    const requestKey = createRequestKey([
      "direct-document",
      baseUrl,
      reloadKey,
      fetchType,
    ]);

    try {
      const doc = (await fetchJson(baseUrl, {
        stage: "document",
        source: "direct-document",
        reason: "doc changed",
        requestKey,
      }, signal)) as unknown;
      if (rid !== docRequestIdRef.current) return;
      if (signal.aborted) return;
      if (isSwaggerConfigLike(doc)) {
        const config: SwaggerConfig = {
          urls: doc.urls
            .filter((item) => typeof item?.url === "string" && item.url.trim())
            .map((item) => ({
              name: typeof item.name === "string" && item.name.trim() ? item.name : item.url,
              url: item.url,
            })),
        };
        dispatch({ type: "CONFIG_SUCCESS", payload: config, directConfigUrl: baseUrl });

        if (!serviceUrlRef.current && config.urls.length > 0) {
          const defaultService = config.urls[0];
          requestDebugStore.recordEvent({
            source: "auto-select-service",
            reason: "auto selected first service from direct swagger-config",
            requestKey: createRequestKey([
              "auto-select-service",
              baseUrl,
              defaultService.url,
              reloadKey,
            ]),
            url: joinUrl(baseUrl, defaultService.url),
            detail: defaultService.name,
          });
          optionsRef.current?.onAutoSelectService?.(defaultService.url);
        }
        return;
      }
      if (!isOpenApiLike(doc)) {
        throw new Error("文档格式不是 OpenAPI/Swagger");
      }
      hasResolvedDocumentRef.current = true;
      // 直连文档模式没有 service 概念，记为 undefined。
      dispatch({ type: "DOCUMENT_SUCCESS", payload: doc, serviceUrl: undefined });
      optionsRef.current?.onDocumentLoaded?.(doc);
    } catch (err) {
      if (isAbortError(err)) return;
      if (rid === docRequestIdRef.current) {
        handleError(err, "加载 Swagger 文档失败", shouldUseNativeFetch);
      }
    }
  }, [fetchJson, fetchType, handleError, reloadKey, shouldUseNativeFetch]);

  const loadSwaggerConfig = useCallback(async (baseUrl: string, rid: number, signal: AbortSignal) => {
    dispatch({ type: "LOAD_CONFIG" });
    try {
      const configCandidates = Array.from(
        new Set([
          `/${version}/api-docs/swagger-config`,
          ...DEFAULT_SWAGGER_CONFIG_CANDIDATES,
        ]),
      );

      let config: SwaggerConfig | null = null;
      let lastCandidateError: unknown = null;
      for (const candidate of configCandidates) {
        if (signal.aborted) return;
        const url = joinUrl(baseUrl, candidate);
        const requestKey = createRequestKey([
          "swagger-config-probe",
          url,
          reloadKey,
          fetchType,
        ]);
        try {
          const parsed = (await fetchJson(url, {
            stage: "config",
            source: "swagger-config-probe",
            reason: "doc changed",
            requestKey,
          }, signal)) as SwaggerConfig;
          if (parsed?.urls?.length) {
            config = parsed;
            break;
          }
        } catch (candidateError) {
          if (isAbortError(candidateError)) return;
          lastCandidateError = candidateError;
        }
      }

      if (!config) {
        if (shouldUseNativeFetch && !isSameOriginInput && lastCandidateError instanceof TypeError) {
          throw lastCandidateError;
        }
        throw new Error("未找到可用的 swagger-config");
      }

      if (rid !== configRequestIdRef.current) return;
      if (signal.aborted) return;
      dispatch({ type: "CONFIG_SUCCESS", payload: config });

      if (!serviceUrlRef.current && config.urls.length > 0) {
        const defaultService = config.urls[0];
        requestDebugStore.recordEvent({
          source: "auto-select-service",
          reason: "auto selected first service",
          requestKey: createRequestKey([
            "auto-select-service",
            baseUrl,
            defaultService.url,
            reloadKey,
          ]),
          url: joinUrl(baseUrl, defaultService.url),
          detail: defaultService.name,
        });
        optionsRef.current?.onAutoSelectService?.(defaultService.url);
      }
    } catch (err) {
      if (isAbortError(err)) return;
      if (rid === configRequestIdRef.current) {
        handleError(err, "加载 Swagger 配置失败，请输入文档 URL", shouldUseNativeFetch);
      }
    }
  }, [
    fetchJson,
    fetchType,
    handleError,
    isSameOriginInput,
    reloadKey,
    shouldUseNativeFetch,
    version,
  ]);

  const loadServiceDocument = useCallback(async (
    baseUrl: string,
    currentServiceUrl: string,
    rid: number,
    signal: AbortSignal,
  ) => {
    dispatch({ type: "LOAD_DOCUMENT" });
    const docUrl = joinUrl(baseUrl, currentServiceUrl);
    const requestKey = createRequestKey([
      "service-document",
      docUrl,
      reloadKey,
      fetchType,
    ]);

    try {
      const doc = (await fetchJson(docUrl, {
        stage: "document",
        source: "service-document",
        reason: "service changed",
        requestKey,
      }, signal)) as OpenAPI.Document;
      if (!isOpenApiLike(doc)) {
        throw new Error("文档格式不是 OpenAPI/Swagger");
      }

      if (rid !== docRequestIdRef.current) return;
      if (signal.aborted) return;

      hasResolvedDocumentRef.current = true;
      dispatch({ type: "DOCUMENT_SUCCESS", payload: doc, serviceUrl: currentServiceUrl });
      optionsRef.current?.onDocumentLoaded?.(doc);
    } catch (err) {
      if (isAbortError(err)) return;
      if (rid === docRequestIdRef.current) {
        handleError(err, "加载 Swagger 文档失败", shouldUseNativeFetch);
      }
    }
  }, [fetchJson, fetchType, handleError, reloadKey, shouldUseNativeFetch]);

  /* ----------------------- Effect 1: 监听输入变化 -> 加载配置/文档 ----------------------- */

  useEffect(() => {
    const baseUrl = normalizedInput;
    if (!baseUrl) return;
    if (directDocumentMode && state.directConfigUrl === baseUrl) return;
    hasResolvedDocumentRef.current = false;
    const controller = createRequestController("new request started");

    if (directDocumentMode) {
      const rid = ++docRequestIdRef.current;
      void loadDirectDocument(baseUrl, rid, controller.signal).finally(() => {
        clearActiveController(controller);
      });
      return;
    }

    const rid = ++configRequestIdRef.current;
    void loadSwaggerConfig(baseUrl, rid, controller.signal).finally(() => {
      clearActiveController(controller);
    });
  }, [
    clearActiveController,
    createRequestController,
    directDocumentMode,
    loadDirectDocument,
    loadSwaggerConfig,
    normalizedInput,
    state.directConfigUrl,
  ]);

  /* --------------------- Effect 2: 监听 Service 变化 -> 加载文档 -------------------- */

  useEffect(() => {
    const baseUrl = state.directConfigUrl || normalizedInput;
    if (!baseUrl || !serviceUrl) return;
    if (!shouldLoadServiceDocument) return;
    if (directDocumentMode && !state.directConfigUrl) return;

    hasResolvedDocumentRef.current = false;
    const controller = createRequestController("new request started");
    const rid = ++docRequestIdRef.current;
    void loadServiceDocument(baseUrl, serviceUrl, rid, controller.signal).finally(() => {
      clearActiveController(controller);
    });
  }, [
    clearActiveController,
    createRequestController,
    directDocumentMode,
    loadServiceDocument,
    normalizedInput,
    serviceUrl,
    shouldLoadServiceDocument,
    state.directConfigUrl,
  ]); // 当 Host + Service 变化时，加载文档

  return {
    configData: state.config,
    documentData: state.document,
    documentServiceUrl: state.documentServiceUrl,
    stage: state.stage,
    error: state.error?.message ?? null,
    errorDetail: state.error,
    // 允许手动清除错误状态
    clearError: () => dispatch({ type: "CLEAR_ERROR" }),
  };
}
