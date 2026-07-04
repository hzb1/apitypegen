import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { DEMO_DOC_PATH, DEMO_SWAGGER_CONFIG_PATH, isDemoDocInput } from "../home.constants.ts";

// 首页 URL 参数名集中管理，避免散落的字符串字面量写错。
// ip 是 doc 的历史别名，仅读取兼容（旧书签 ?ip=... 仍能打开），不再写入；
// handleCommitIp 会把 ip 归一化为 doc 并删除 ip。
const URL_PARAMS = {
  doc: "doc",
  ip: "ip", // legacy alias of doc, read-only
  service: "service",
  api: "api",
  local: "local",
  demo: "demo",
} as const;

export function useHomeDocumentState() {
  const [searchParams, setSearchParams] = useSearchParams();

  // 首页 URL 协议：doc/ip 表示文档来源，service 表示 swagger-config 中的具体服务，api 表示当前接口。
  const ipFromUrl = searchParams.get(URL_PARAMS.doc)?.trim() ?? searchParams.get(URL_PARAMS.ip)?.trim() ?? "";
  const serviceUrl = searchParams.get(URL_PARAMS.service) ?? undefined;
  const selectedApiKey = searchParams.get(URL_PARAMS.api);
  const localId = searchParams.get(URL_PARAMS.local)?.trim() || undefined;
  const isDemoMode = searchParams.get(URL_PARAMS.demo) === "1" || isDemoDocInput(ipFromUrl);
  const hasIpParam = Boolean(ipFromUrl);
  const hasDocumentSource = Boolean(ipFromUrl || localId);
  const normalizedDocInput = useMemo(() => {
    if (!ipFromUrl) return "";
    if (ipFromUrl.startsWith("/")) {
      return new URL(ipFromUrl, window.location.origin).toString();
    }
    return /^https?:\/\//.test(ipFromUrl) ? ipFromUrl : `http://${ipFromUrl}`;
  }, [ipFromUrl]);

  const [inputIp, setInputIp] = useState(ipFromUrl);
  const [reloadKey, setReloadKey] = useState(0);

  const handleCommitIp = (nextIp: string) => {
    const normalized = nextIp.trim();
    if (!normalized) return;
    setInputIp(normalized);
    setReloadKey((current) => current + 1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(URL_PARAMS.doc, normalized);
      next.delete(URL_PARAMS.ip);
      next.delete(URL_PARAMS.local);
      if (isDemoDocInput(normalized)) {
        next.set(URL_PARAMS.demo, "1");
      } else {
        next.delete(URL_PARAMS.demo);
      }
      // 切换文档后，旧服务和旧接口都不再可靠，需要重新解析。
      next.delete(URL_PARAMS.api);
      next.delete(URL_PARAMS.service);
      return next;
    });
  };

  const handleTryDemo = () => {
    setInputIp(DEMO_DOC_PATH);
    setReloadKey((current) => current + 1);
    setSearchParams(() => {
      const next = new URLSearchParams();
      next.set(URL_PARAMS.doc, DEMO_DOC_PATH);
      next.set(URL_PARAMS.demo, "1");
      return next;
    });
  };

  const handleTryMultiServiceDemo = () => {
    setInputIp(DEMO_SWAGGER_CONFIG_PATH);
    setReloadKey((current) => current + 1);
    setSearchParams(() => {
      const next = new URLSearchParams();
      next.set(URL_PARAMS.doc, DEMO_SWAGGER_CONFIG_PATH);
      next.set(URL_PARAMS.demo, "1");
      return next;
    });
  };

  const handleOpenLocalExport = (id: string) => {
    setInputIp("");
    setReloadKey((current) => current + 1);
    setSearchParams(() => {
      const next = new URLSearchParams();
      next.set(URL_PARAMS.local, id);
      return next;
    });
  };

  const handleServiceChange = (url?: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (url) {
        next.set(URL_PARAMS.service, url);
      } else {
        next.delete(URL_PARAMS.service);
      }
      // 服务变化后 API key 可能不存在，清掉当前选中态。
      next.delete(URL_PARAMS.api);
      return next;
    });
  };

  useEffect(() => {
    setInputIp(ipFromUrl);
  }, [ipFromUrl]);

  return {
    searchParams,
    setSearchParams,
    ipFromUrl,
    serviceUrl,
    selectedApiKey,
    localId,
    isDemoMode,
    hasIpParam,
    hasDocumentSource,
    normalizedDocInput,
    inputIp,
    setInputIp,
    reloadKey,
    handleCommitIp,
    handleTryDemo,
    handleTryMultiServiceDemo,
    handleOpenLocalExport,
    handleServiceChange,
  };
}
