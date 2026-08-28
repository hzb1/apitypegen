import type { OpenAPI } from "openapi-types";
import type { GeneratorOptions } from "@/utils/SwaggerParser.ts";
import type { ConfigState } from "@/hooks/useOptions.ts";
import { buildApiGroups, buildGroupedApis } from "@/hooks/useApiNavigationData.ts";
import { getApiBaseUrl } from "../hooks/useApiBaseUrl.ts";
import { buildTsSwaggerExport } from "./exportApiData.ts";
import type { ImportApiExportResult, TsSwaggerExport } from "./export.types.ts";

const IMPORTED_OPENAPI_DOC_URL = "imported-openapi";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOpenApiDocument(value: unknown): value is OpenAPI.Document {
  if (!isRecord(value)) return false;
  const hasVersion = typeof value.openapi === "string" || typeof value.swagger === "string";
  return hasVersion && isRecord(value.paths);
}

function stripJsonExtension(fileName: string) {
  return fileName.replace(/\.json$/i, "").trim();
}

function getDocumentTitle(documentData: OpenAPI.Document, fileName: string) {
  const record = documentData as Record<string, unknown>;
  const info = isRecord(record.info) ? record.info : undefined;
  const title = typeof info?.title === "string" ? info.title.trim() : "";
  return title || stripJsonExtension(fileName) || "Imported API";
}

function validateTsSwaggerExport(value: Record<string, unknown>): TsSwaggerExport {
  if (value.exportVersion !== "1.0") {
    throw new Error("不是有效的 APITypeGen 导出文件：exportVersion 不支持");
  }
  if (!isOpenApiDocument(value.openapi)) {
    throw new Error("不是有效的 APITypeGen 导出文件：缺少 openapi 文档");
  }
  if (!isRecord(value.source)) {
    throw new Error("不是有效的 APITypeGen 导出文件：缺少 source 信息");
  }
  if (!Array.isArray(value.groups) || !Array.isArray(value.apis)) {
    throw new Error("不是有效的 APITypeGen 导出文件：缺少 groups/apis 数据");
  }
  const source = value.source;

  return {
    exportVersion: "1.0",
    appVersion: typeof value.appVersion === "string" ? value.appVersion : "unknown",
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : new Date().toISOString(),
    source: {
      ...(source as TsSwaggerExport["source"]),
      docUrl: typeof source.docUrl === "string" ? source.docUrl : "imported-ts-swagger-export",
    },
    generatorOptions: isRecord(value.generatorOptions) ? value.generatorOptions : {},
    openapi: value.openapi,
    groups: value.groups as TsSwaggerExport["groups"],
    apis: value.apis as TsSwaggerExport["apis"],
    services: Array.isArray(value.services)
      ? value.services as TsSwaggerExport["services"]
      : undefined,
  };
}

function buildExportFromOpenApi(params: {
  documentData: OpenAPI.Document;
  fileName: string;
  generatorConfig: ConfigState;
  generatorOptions: GeneratorOptions;
}): TsSwaggerExport {
  const { documentData, fileName, generatorConfig, generatorOptions } = params;
  const groupedApis = buildGroupedApis(documentData);
  const apiGroups = buildApiGroups({
    groupedApis,
    selectedApiKey: null,
    expandedGroupList: [],
  });

  if (apiGroups.every((group) => group.children.length === 0)) {
    throw new Error("OpenAPI/Swagger 文档中没有可导入的接口 paths");
  }

  const title = getDocumentTitle(documentData, fileName);
  const payload = buildTsSwaggerExport({
    documentData,
    apiGroups,
    apiBaseUrl: getApiBaseUrl({ documentData, normalizedDocInput: "" }),
    docUrl: IMPORTED_OPENAPI_DOC_URL,
    importedFileName: fileName,
    generatorConfig,
    generatorOptions,
  });

  return {
    ...payload,
    source: {
      ...payload.source,
      title,
      importedFileName: fileName,
    },
  };
}

export function parseImportedApiExport(
  fileText: string,
  fileName: string,
  generatorConfig: ConfigState,
  generatorOptions: GeneratorOptions,
): ImportApiExportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    throw new Error("JSON 格式错误，请选择合法的 JSON 文件");
  }

  if (!isRecord(parsed)) {
    throw new Error("不支持的文件格式：JSON 根节点必须是对象");
  }

  if (parsed.exportVersion === "1.0") {
    const payload = validateTsSwaggerExport(parsed);
    return {
      payload,
      format: "ts-swagger-export",
      name: payload.source.title || payload.source.importedFileName || stripJsonExtension(fileName) || "API Export",
    };
  }

  if (isOpenApiDocument(parsed)) {
    const documentData = parsed as OpenAPI.Document;
    const payload = buildExportFromOpenApi({
      documentData,
      fileName,
      generatorConfig,
      generatorOptions,
    });
    return {
      payload,
      format: "openapi",
      name: payload.source.title || stripJsonExtension(fileName) || "Imported API",
    };
  }

  throw new Error("不支持的文件格式：请选择 APITypeGen 导出的 JSON，或普通 OpenAPI/Swagger JSON");
}
