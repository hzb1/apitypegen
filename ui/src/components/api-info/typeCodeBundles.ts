import type { GeneratedTypes } from "@/utils/SwaggerParser.ts";
import type { TsCodeParts } from "@/pages/home/home.types.ts";

const EMPTY_RESPONSE_CODE = "// 当前接口没有响应类型";

const joinCodeParts = (...parts: Array<string | undefined>): string => parts
  .map((part) => part?.trim())
  .filter((part): part is string => Boolean(part))
  .join("\n\n");

const getResponseTypeName = (status: string): string => {
  const normalizedStatus = status.toLowerCase() === "default"
    ? "Default"
    : status.replace(/[^0-9A-Z_a-z$]/gu, "_");
  return `Response${normalizedStatus || "Unknown"}`;
};

const renameResponseEntryType = (code: string, typeName: string): string => code.replace(
  /(^|\n)(\s*(?:export\s+)?type\s+)ResponseData\b/u,
  (_match, lineStart: string, declarationStart: string) => `${lineStart}${declarationStart}${typeName}`,
);

const buildAllResponseEntry = (
  responses: GeneratedTypes["responses"],
  typeNames: string[],
): string => {
  const sampleCode = responses[0]?.code ?? "";
  const exportPrefix = /^\s*export\s+type\s+ResponseData\b/u.test(sampleCode) ? "export " : "";
  const semicolon = /;\s*$/u.test(sampleCode) ? ";" : "";
  return `${exportPrefix}type ResponseData = ${typeNames.join(" | ")}${semicolon}`;
};

/** 生成 Path parameters 卡片可独立复制的完整代码。 */
export const buildPathParametersCode = (codeMap?: TsCodeParts): string => joinCodeParts(
  codeMap?.["Query Params"],
  codeMap?.["Query Types"],
);

/** 生成 Request body 卡片可独立复制的完整代码。 */
export const buildRequestBodyCode = (codeMap?: TsCodeParts): string => joinCodeParts(
  codeMap?.["Request Body"],
  codeMap?.["Request Body Types"],
);

/** 生成当前响应状态或全部响应可独立复制的完整代码。 */
export const buildResponseCode = (codeMap: TsCodeParts | undefined, selectedResponse: string): string => {
  const responses = codeMap?.Responses ?? [];
  if (!responses.length) {
    return joinCodeParts(codeMap?.["Response Data"], codeMap?.["All Response Types"])
      || EMPTY_RESPONSE_CODE;
  }

  if (selectedResponse !== "all") {
    const response = responses.find((item) => item.status === selectedResponse);
    if (!response) return EMPTY_RESPONSE_CODE;
    return joinCodeParts(response.code, response.standaloneModels);
  }

  const typeNames = responses.map((response) => getResponseTypeName(response.status));
  const responseSections = responses.map((response, index) => (
    `// 响应 ${response.status}${response.description ? `：${response.description}` : ""}\n`
    + renameResponseEntryType(response.code, typeNames[index])
  ));

  return joinCodeParts(
    buildAllResponseEntry(responses, typeNames),
    ...responseSections,
    codeMap?.["All Response Types"],
  );
};
