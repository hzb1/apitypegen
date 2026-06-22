import { useEffect, useState } from "react";
import type { OpenAPI } from "openapi-types";
import type { ApiDetail } from "../../../../types.ts";
import type { GeneratorOptions } from "@/utils/SwaggerParser.ts";
import type { TsCodeParts } from "../home.types.ts";

export function useHomeTsCodeParts(params: {
  documentData: OpenAPI.Document | null;
  selectedApi: ApiDetail | null;
  generatorOptions: GeneratorOptions;
}) {
  const { documentData, selectedApi, generatorOptions } = params;
  const [tsCodeParts, setTsCodeParts] = useState<TsCodeParts | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    if (!documentData || !selectedApi) {
      setTsCodeParts(undefined);
      return () => {
        cancelled = true;
      };
    }

    setTsCodeParts(undefined);

    const loadTsCodeParts = async () => {
      // SwaggerToTS 只在选择具体 API 后动态加载，避免首页首屏提前吃解析器体积。
      const { SwaggerToTS } = await import("@/utils/SwaggerParser.ts");
      const parser = new SwaggerToTS(documentData, generatorOptions);
      const res = parser.getStructuredTypes(selectedApi.path, selectedApi.method);

      // 用户快速切换接口时，丢弃旧请求的结果，避免代码片段闪回。
      if (cancelled) return;

      setTsCodeParts({
        Models: res.models,
        "Query Params": res.queryParams,
        "Request Body": res.requestBody,
        "Response Data": res.responseData,
      });
    };

    void loadTsCodeParts();

    return () => {
      cancelled = true;
    };
  }, [documentData, generatorOptions, selectedApi]);

  return tsCodeParts;
}
