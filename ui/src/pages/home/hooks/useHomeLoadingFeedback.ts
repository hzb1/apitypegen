import { useMemo } from "react";
import type { SwaggerLoadingStage } from "@/hooks/useSwagger.ts";
import type { LoadingFeedback } from "../home.types.ts";

export function useHomeLoadingFeedback(stage: SwaggerLoadingStage): LoadingFeedback {
  const configLoading = stage === "config";
  const docLoading = stage === "document";
  const probeLoading = stage === "probe";

  return useMemo(() => {
    if (probeLoading) {
      return {
        title: "正在加载文档",
        button: "检查地址...",
        text: "正在请求文档地址，识别 OpenAPI / Swagger 数据",
      };
    }
    if (configLoading) {
      return {
        title: "正在加载文档",
        button: "探测配置...",
        text: "正在探测 swagger-config 和可用服务列表",
      };
    }
    if (docLoading) {
      return {
        title: "正在加载文档",
        button: "读取文档...",
        text: "正在请求 OpenAPI 文档并解析接口定义",
      };
    }
    return {
      title: "正在准备文档",
      button: "加载文档",
      text: "正在准备文档请求",
    };
  }, [configLoading, docLoading, probeLoading]);
}
