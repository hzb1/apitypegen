import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { DEMO_DOC_PATH, isDemoDocInput } from "../home.constants.ts";

export function useHomeDocumentState() {
  const [searchParams, setSearchParams] = useSearchParams();

  // 首页 URL 协议：doc/ip 表示文档来源，service 表示 swagger-config 中的具体服务，api 表示当前接口。
  const ipFromUrl = searchParams.get("doc")?.trim() ?? searchParams.get("ip")?.trim() ?? "";
  const serviceUrl = searchParams.get("service") ?? undefined;
  const selectedApiKey = searchParams.get("api");
  const isDemoMode = searchParams.get("demo") === "1" || isDemoDocInput(ipFromUrl);
  const hasIpParam = Boolean(ipFromUrl);
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
      next.set("doc", normalized);
      next.delete("ip");
      if (isDemoDocInput(normalized)) {
        next.set("demo", "1");
      } else {
        next.delete("demo");
      }
      // 切换文档后，旧服务和旧接口都不再可靠，需要重新解析。
      next.delete("api");
      next.delete("service");
      return next;
    });
  };

  const handleTryDemo = () => {
    setInputIp(DEMO_DOC_PATH);
    setReloadKey((current) => current + 1);
    setSearchParams(() => {
      const next = new URLSearchParams();
      next.set("doc", DEMO_DOC_PATH);
      next.set("demo", "1");
      return next;
    });
  };

  const handleServiceChange = (url?: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (url) {
        next.set("service", url);
      } else {
        next.delete("service");
      }
      // 服务变化后 API key 可能不存在，清掉当前选中态。
      next.delete("api");
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
    isDemoMode,
    hasIpParam,
    normalizedDocInput,
    inputIp,
    setInputIp,
    reloadKey,
    handleCommitIp,
    handleTryDemo,
    handleServiceChange,
  };
}
