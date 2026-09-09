import { useEffect, useState } from "react";
import type { OpenAPI } from "openapi-types";
import type { ApiDetail } from "../../../../types.ts";
import type { GeneratorOptions } from "@/utils/SwaggerParser.ts";
import type { TsCodeParts } from "../home.types.ts";
import type {
  TypeScriptSyntaxDiagnostic,
  TypeScriptValidationInput,
} from "../../../../../cli/src/core/typescript-validation.ts";
import { reportGeneratedTypeScriptError } from "@/telemetry/generatedTypeScript.ts";

/** 首页 TypeScript 生成与语法校验的状态。 */
export type HomeTsCodePartsResult = {
  /** 当前接口按区域拆分的生成代码。 */
  tsCodeParts?: TsCodeParts;

  /** 当前生成代码中发现的安全语法诊断。 */
  syntaxDiagnostics: TypeScriptSyntaxDiagnostic[];
};

/** 首页生成 TypeScript 时依赖的文档、接口和生成器设置。 */
export type UseHomeTsCodePartsParams = {
  /** 当前加载的 OpenAPI 文档。 */
  documentData: OpenAPI.Document | null;

  /** 当前用户选中的接口。 */
  selectedApi: ApiDetail | null;

  /** 当前启用的 TypeScript 生成选项。 */
  generatorOptions: GeneratorOptions;
};

export function useHomeTsCodeParts(
  params: UseHomeTsCodePartsParams,
): HomeTsCodePartsResult {
  const { documentData, selectedApi, generatorOptions } = params;
  const [tsCodeParts, setTsCodeParts] = useState<TsCodeParts | undefined>(undefined);
  const [syntaxDiagnostics, setSyntaxDiagnostics] = useState<TypeScriptSyntaxDiagnostic[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!documentData || !selectedApi) {
      setTsCodeParts(undefined);
      setSyntaxDiagnostics([]);
      return () => {
        cancelled = true;
      };
    }

    setTsCodeParts(undefined);
    setSyntaxDiagnostics([]);

    const loadTsCodeParts = async () => {
      // SwaggerToTS 只在选择具体 API 后动态加载，避免首页首屏提前吃解析器体积。
      const { SwaggerToTS } = await import("@/utils/SwaggerParser.ts");
      const parser = new SwaggerToTS(documentData, generatorOptions);
      const res = parser.getStructuredTypes(selectedApi.path, selectedApi.method);
      const { validateTypeScriptSyntax } = await import(
        "../../../../../cli/src/core/typescript-validation.ts"
      );
      const validationInputs: TypeScriptValidationInput[] = [
        { code: res.queryParams, area: "query", source: "web" },
        { code: res.requestBody, area: "requestBody", source: "web" },
        { code: res.models, area: "models", source: "web" },
        {
          code: res.responses.map((response) =>
            response.code.replaceAll("ResponseData", `Response${response.status}`),
          ).join("\n\n"),
          area: "response",
          source: "web",
          responseStatus: "all",
        },
      ];
      res.responses.forEach((response) => {
        validationInputs.push(
          {
            code: response.code,
            area: "response",
            source: "web",
            responseStatus: response.status,
          },
          {
            code: response.models,
            area: "models",
            source: "web",
            responseStatus: response.status,
          },
        );
      });
      const validationResults = validationInputs
        .filter((input) => input.code.trim().length > 0)
        .map(validateTypeScriptSyntax);
      const diagnostics = validationResults.flatMap((result) => result.diagnostics);

      validationResults.forEach(reportGeneratedTypeScriptError);

      // 用户快速切换接口时，丢弃旧请求的结果，避免代码片段闪回。
      if (cancelled) return;

      setTsCodeParts({
        Models: res.models,
        "Query Params": res.queryParams,
        "Request Body": res.requestBody,
        "Response Data": res.responseData,
        Responses: res.responses,
      });
      setSyntaxDiagnostics(diagnostics);
    };

    void loadTsCodeParts();

    return () => {
      cancelled = true;
    };
  }, [documentData, generatorOptions, selectedApi]);

  return { tsCodeParts, syntaxDiagnostics };
}
