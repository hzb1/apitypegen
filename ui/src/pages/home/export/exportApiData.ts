import type { OpenAPI } from "openapi-types";
import type { GeneratorOptions } from "@/utils/SwaggerParser.ts";
import { SwaggerToTS } from "@/utils/SwaggerParser.ts";
import type { ConfigState } from "@/hooks/useOptions.ts";
import type { ApiGroup } from "../utils.ts";
import { APP_VERSION } from "../home.constants.ts";
import type { TsSwaggerExport } from "./export.types.ts";

type BuildTsSwaggerExportParams = {
  documentData: OpenAPI.Document;
  apiGroups: ApiGroup[];
  apiBaseUrl: string;
  docUrl: string;
  serviceUrl?: string;
  importedFileName?: string;
  generatorConfig: ConfigState;
  generatorOptions: GeneratorOptions;
};

function getDocumentInfo(documentData: OpenAPI.Document) {
  const record = documentData as Record<string, unknown>;
  const info = record.info && typeof record.info === "object"
    ? record.info as Record<string, unknown>
    : {};
  return {
    title: typeof info.title === "string" ? info.title : undefined,
    version: typeof info.version === "string" ? info.version : undefined,
  };
}

function buildFullUrl(apiBaseUrl: string, path: string) {
  if (!apiBaseUrl) return path;
  try {
    const normalizedBase = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
    return new URL(path, normalizedBase).toString();
  } catch {
    const normalizedBase = apiBaseUrl.replace(/\/+$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  }
}

function compactGeneratorOptions(config: ConfigState): Record<string, unknown> {
  return {
    indent: config.indent,
    useInterface: config.useInterface,
    addExport: config.addExport,
    semicolon: config.semicolon,
    arrayType: config.arrayType,
    int64ToString: config.int64ToString,
    namingStrategy: config.namingStrategy,
    showExample: config.showExample,
  };
}

export function buildTsSwaggerExport(params: BuildTsSwaggerExportParams): TsSwaggerExport {
  const {
    documentData,
    apiGroups,
    apiBaseUrl,
    docUrl,
    serviceUrl,
    importedFileName,
    generatorConfig,
    generatorOptions,
  } = params;
  const info = getDocumentInfo(documentData);
  const parser = new SwaggerToTS(documentData, generatorOptions);
  const apis = apiGroups.flatMap((group) => (
    group.children.map((api) => {
      const operation = api.operation;
      const operationRecord = operation as Record<string, unknown> | undefined;
      const tsCode = parser.getStructuredTypes(api.path, api.method);
      return {
        key: api.key,
        method: api.method,
        path: api.path,
        fullUrl: buildFullUrl(apiBaseUrl, api.path),
        summary: operation?.summary,
        description: operation?.description,
        operationId: operation?.operationId,
        tags: operation?.tags ?? [],
        parameters: operation?.parameters ?? [],
        requestBody: operationRecord?.requestBody,
        responses: operation?.responses,
        tsCode: {
          models: tsCode.models,
          queryParams: tsCode.queryParams,
          requestBody: tsCode.requestBody,
          responseData: tsCode.responseData,
        },
      };
    })
  ));

  return {
    exportVersion: "1.0",
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      docUrl,
      serviceUrl,
      apiBaseUrl,
      title: info.title,
      version: info.version,
      importedFileName,
    },
    generatorOptions: compactGeneratorOptions(generatorConfig),
    openapi: documentData,
    groups: apiGroups.map((group) => ({
      id: group.id,
      name: group.name,
      apiKeys: group.children.map((api) => api.key),
    })),
    apis,
  };
}
