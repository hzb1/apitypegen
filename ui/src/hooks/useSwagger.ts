import { useEffect, useMemo, useReducer, useRef } from "react";
import type { OpenAPI } from "openapi-types";
import { proxyFetch } from "@extension/src/shared/proxySdk.ts";
import { ProxyError } from "@extension/src/shared/types.ts";

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
  stage: SwaggerLoadingStage;
  error: SwaggerErrorDetail | null;
};

type Action =
  | { type: "PROBE" }
  | { type: "LOAD_CONFIG" }
  | { type: "LOAD_DOCUMENT" }
  | { type: "LOAD_DIRECT_DOCUMENT" }
  | { type: "CONFIG_SUCCESS"; payload: SwaggerConfig }
  | { type: "DOCUMENT_SUCCESS"; payload: OpenAPI.Document }
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
};

export type SwaggerFetchMode = "auto" | "native" | "proxy";

/* -------------------------------------------------------------------------- */
/* reducer                                   */
/* -------------------------------------------------------------------------- */

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "PROBE":
      return { ...state, config: null, document: null, stage: "probe", error: null };
    case "LOAD_CONFIG":
      return { ...state, config: null, document: null, stage: "config", error: null }; //
    case "LOAD_DOCUMENT":
      return { ...state, document: null, stage: "document", error: null }; //
    case "LOAD_DIRECT_DOCUMENT":
      return { ...state, config: null, document: null, stage: "document", error: null };
    case "CONFIG_SUCCESS":
      return { ...state, config: action.payload, stage: "idle", error: null }; //
    case "DOCUMENT_SUCCESS":
      return { ...state, document: action.payload, stage: "idle", error: null }; //
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
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase).toString();
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
    stage: "idle",
    error: null,
  });

  // 使用 Ref 记录请求 ID，防止竞态条件
  const configRequestIdRef = useRef(0);
  const docRequestIdRef = useRef(0);
  const hasResolvedDocumentRef = useRef(false);

  /**
   * 辅助：统一错误处理
   */
  const handleError = (err: unknown, defaultMsg: string, usedNativeFetch: boolean) => {
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
  };

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

  /* ----------------------- Effect 1: 监听输入变化 -> 加载配置/文档 ----------------------- */

  useEffect(() => {
    const baseUrl = normalizedInput;
    if (!baseUrl) return;
    if (serviceUrl && !directDocumentMode) return;
    hasResolvedDocumentRef.current = false;

    const fetchJson = async (url: string) => {
      const res = shouldUseNativeFetch
        ? await fetch(url)
        : await proxyFetch(url, { timeout: 10000 });
      if (!res.ok) throw new Error(`Status: ${res.status}`);
      return res.json();
    };

    const fetchDirectDocument = async (
      silent = false,
      probing = false,
    ): Promise<boolean> => {
      const rid = ++docRequestIdRef.current;
      dispatch({ type: probing ? "PROBE" : "LOAD_DIRECT_DOCUMENT" });
      try {
        const doc = (await fetchJson(baseUrl)) as unknown;
        if (rid !== docRequestIdRef.current) return false;
        if (!isOpenApiLike(doc)) {
          throw new Error("文档格式不是 OpenAPI/Swagger");
        }
        hasResolvedDocumentRef.current = true;
        dispatch({ type: "DOCUMENT_SUCCESS", payload: doc });
        options?.onDocumentLoaded?.(doc);
        return true;
      } catch (err) {
        if (rid === docRequestIdRef.current) {
          if (!silent) {
            handleError(err, "加载 Swagger 文档失败", shouldUseNativeFetch);
          }
        }
        return false;
      }
    };

    const fetchConfig = async () => {
      const rid = ++configRequestIdRef.current;
      dispatch({ type: "LOAD_CONFIG" });
      try {
        const configCandidates = [
          `/${version}/api-docs/swagger-config`,
          ...DEFAULT_SWAGGER_CONFIG_CANDIDATES,
        ];

        let config: SwaggerConfig | null = null;
        let lastCandidateError: unknown = null;
        for (const candidate of configCandidates) {
          const url = joinUrl(baseUrl, candidate);
          try {
            const parsed = (await fetchJson(url)) as SwaggerConfig;
            if (parsed?.urls?.length) {
              config = parsed;
              break;
            }
          } catch (candidateError) {
            lastCandidateError = candidateError;
            // continue probing
          }
        }

        if (!config) {
          if (shouldUseNativeFetch && !isSameOriginInput && lastCandidateError instanceof TypeError) {
            throw lastCandidateError;
          }
          throw new Error("未找到可用的 swagger-config");
        }

        if (rid !== configRequestIdRef.current) return;
        dispatch({ type: "CONFIG_SUCCESS", payload: config });

        if (!serviceUrl && config.urls.length > 0) {
          options?.onAutoSelectService?.(config.urls[0].url);
        }
      } catch (err) {
        if (rid === configRequestIdRef.current) {
          if (hasResolvedDocumentRef.current) return;
          if (serviceUrl) return;
          handleError(err, "加载 Swagger 配置失败，请输入文档 URL", shouldUseNativeFetch);
        }
      }
    };

    if (directDocumentMode) {
      fetchDirectDocument(false);
      return;
    }

    const fetchWithFallback = async () => {
      const directOk = await fetchDirectDocument(true, true);
      if (directOk) return;
      fetchConfig();
    };

    fetchWithFallback();
  }, [directDocumentMode, isSameOriginInput, normalizedInput, reloadKey, serviceUrl, shouldUseNativeFetch, version]);

  /* --------------------- Effect 2: 监听 Service 变化 -> 加载文档 -------------------- */

  useEffect(() => {
    const baseUrl = normalizedInput;
    if (!baseUrl || !serviceUrl) return;
    if (directDocumentMode) return;

    const rid = ++docRequestIdRef.current;
    hasResolvedDocumentRef.current = false;
    dispatch({ type: "LOAD_DOCUMENT" });

    const fetchDocument = async () => {
      try {
        const docUrl = joinUrl(baseUrl, serviceUrl);
        const res = shouldUseNativeFetch
          ? await fetch(docUrl)
          : await proxyFetch(docUrl, { timeout: 10000 });
        if (!res.ok) throw new Error(`Status: ${res.status}`);
        const doc = (await res.json()) as OpenAPI.Document;
        if (!isOpenApiLike(doc)) {
          throw new Error("文档格式不是 OpenAPI/Swagger");
        }

        if (rid !== docRequestIdRef.current) return;

        hasResolvedDocumentRef.current = true;
        dispatch({ type: "DOCUMENT_SUCCESS", payload: doc });
        // 成功后触发回调
        options?.onDocumentLoaded?.(doc);
      } catch (err) {
        if (rid === docRequestIdRef.current) {
          handleError(err, "加载 Swagger 文档失败", shouldUseNativeFetch);
        }
      }
    };

    fetchDocument();
  }, [directDocumentMode, normalizedInput, reloadKey, serviceUrl, shouldUseNativeFetch]); // 当 Host + Service 变化时，加载文档

  return {
    configData: state.config,
    documentData: state.document,
    stage: state.stage,
    error: state.error?.message ?? null,
    errorDetail: state.error,
    // 允许手动清除错误状态
    clearError: () => dispatch({ type: "CLEAR_ERROR" }),
  };
}
