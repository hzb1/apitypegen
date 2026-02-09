import { useEffect, useReducer, useRef } from "react";
import type { OpenAPI } from "openapi-types";
import { proxyFetch } from "@extension/src/shared/proxySdk.ts";
import { ProxyError } from "@extension/src/shared/types.ts";

/* -------------------------------------------------------------------------- */
/* types                                    */
/* -------------------------------------------------------------------------- */

const swaggerConfigUrl = "/api-docs/swagger-config"; //

export type SwaggerLoadingStage = "idle" | "config" | "document"; //

type SwaggerConfig = {
  urls: { name: string; url: string }[];
};

type State = {
  config: SwaggerConfig | null;
  document: OpenAPI.Document | null;
  stage: SwaggerLoadingStage;
  error: string | null;
};

type Action =
  | { type: "LOAD_CONFIG" }
  | { type: "LOAD_DOCUMENT" }
  | { type: "CONFIG_SUCCESS"; payload: SwaggerConfig }
  | { type: "DOCUMENT_SUCCESS"; payload: OpenAPI.Document }
  | { type: "ERROR"; payload: string }
  | { type: "CLEAR_ERROR" };

export type UseSwaggerOptions = {
  // 当配置加载完成，且发现 URL 缺少 service 时，建议 UI 层补全 URL
  onAutoSelectService?: (defaultServiceUrl: string) => void;
  // 新增回调：当文档加载成功时触发
  onDocumentLoaded?: (doc: OpenAPI.Document) => void;
};

/* -------------------------------------------------------------------------- */
/* reducer                                   */
/* -------------------------------------------------------------------------- */

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "LOAD_CONFIG":
      return { ...state, config: null, document: null, stage: "config", error: null }; //
    case "LOAD_DOCUMENT":
      return { ...state, document: null, stage: "document", error: null }; //
    case "CONFIG_SUCCESS":
      return { ...state, config: action.payload, stage: "idle" }; //
    case "DOCUMENT_SUCCESS":
      return { ...state, document: action.payload, stage: "idle" }; //
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

function normalizeBaseUrl(ip: string) {
  const v = ip.trim();
  if (!v) return "";
  return /^https?:\/\//.test(v) ? v : `http://${v}`; //
}

/* -------------------------------------------------------------------------- */
/* hook                                     */
/* -------------------------------------------------------------------------- */

export function useSwagger(params: {
  ip: string;
  serviceUrl?: string;
  version?: string;
  options?: UseSwaggerOptions;
}) {
  const { ip, serviceUrl, version = "v3", options } = params;

  const [state, dispatch] = useReducer(reducer, {
    config: null,
    document: null,
    stage: "idle",
    error: null,
  });

  // 使用 Ref 记录请求 ID，防止竞态条件
  const configRequestIdRef = useRef(0);
  const docRequestIdRef = useRef(0);

  /**
   * 辅助：统一错误处理
   */
  const handleError = (err: unknown, defaultMsg: string) => {
    let msg = defaultMsg;
    if (err instanceof ProxyError) {
      switch (err.type) {
        case 'NETWORK_ERROR': msg = '网络连接失败'; break;
        case 'TIMEOUT': msg = '请求超时'; break;
        default: msg = err.message;
      }
    }
    dispatch({ type: "ERROR", payload: msg });
  };

  /* ----------------------- Effect 1: 监听 IP 变化 -> 加载配置 ----------------------- */

  useEffect(() => {
    const baseUrl = normalizeBaseUrl(ip);
    if (!baseUrl) return;

    const rid = ++configRequestIdRef.current;
    dispatch({ type: "LOAD_CONFIG" });

    const fetchConfig = async () => {
      try {
        const configUrl = `${baseUrl}/${version}${swaggerConfigUrl}`; //
        console.log('configUrl', configUrl);
        const res = await proxyFetch(configUrl); //

        if (!res.ok) throw new Error(`Status: ${res.status}`);
        const config = (await res.json()) as SwaggerConfig;

        if (rid !== configRequestIdRef.current) return;

        dispatch({ type: "CONFIG_SUCCESS", payload: config });

        // 核心纠偏逻辑：如果 URL 中没有 serviceUrl，且配置里有，通知 UI 补全
        if (!serviceUrl && config.urls?.length > 0) {
          options?.onAutoSelectService?.(config.urls[0].url);
        }
      } catch (err) {
        if (rid === configRequestIdRef.current) {
          handleError(err, "加载 Swagger 配置失败");
        }
      }
    };

    fetchConfig();
  }, [ip, version]); // 仅在 IP 或版本变化时重新加载配置

  /* --------------------- Effect 2: 监听 Service 变化 -> 加载文档 -------------------- */

  useEffect(() => {
    const baseUrl = normalizeBaseUrl(ip);
    if (!baseUrl || !serviceUrl) return;

    const rid = ++docRequestIdRef.current;
    dispatch({ type: "LOAD_DOCUMENT" });

    const fetchDocument = async () => {
      try {
        const docUrl = `${baseUrl}${serviceUrl}`; //
        const res = await proxyFetch(docUrl);
        const doc = (await res.json()) as OpenAPI.Document;

        if (rid !== docRequestIdRef.current) return;

        dispatch({ type: "DOCUMENT_SUCCESS", payload: doc });
        // 成功后触发回调
        options?.onDocumentLoaded?.(doc);
      } catch (err) {
        if (rid === docRequestIdRef.current) {
          handleError(err, "加载 Swagger 文档失败");
        }
      }
    };

    fetchDocument();
  }, [ip, serviceUrl]); // 当 IP 或 Service 任何一个变化且都有值时，加载文档

  return {
    configData: state.config,
    documentData: state.document,
    stage: state.stage,
    error: state.error,
    // 允许手动清除错误状态
    clearError: () => dispatch({ type: "CLEAR_ERROR" }),
  };
}
