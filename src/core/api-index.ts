const API_METHODS = ["get", "post", "put", "delete", "patch"] as const;

export type ApiMethod = (typeof API_METHODS)[number];

export interface ApiItem {
  key: string;
  path: string;
  method: ApiMethod;
  summary: string;
  description: string;
  operationId: string;
  tags: string[];
}

type SwaggerOperation = {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: unknown;
};

type SwaggerPathItem = Partial<Record<ApiMethod, SwaggerOperation>> & Record<string, unknown>;

type SwaggerDocument = {
  paths?: Record<string, unknown>;
};

function stringifyTags(tags: unknown): string {
  if (!Array.isArray(tags)) return "";
  return tags.filter(Boolean).join(" ");
}

function normalizeMethod(value: string): ApiMethod | undefined {
  const normalized = value.trim().toLowerCase();
  return API_METHODS.find((item) => item === normalized);
}

export function collectApis(document: SwaggerDocument): ApiItem[] {
  const apis: ApiItem[] = [];
  const paths = document?.paths || {};

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const method of API_METHODS) {
    const operation = (pathItem as SwaggerPathItem)[method];
      if (!operation) continue;

      const tags = Array.isArray(operation.tags)
        ? operation.tags.filter((tag): tag is string => typeof tag === "string")
        : [];

      apis.push({
        key: `${method.toUpperCase()} ${path}`,
        path,
        method,
        summary: operation.summary || "",
        description: operation.description || "",
        operationId: operation.operationId || "",
        tags,
      });
    }
  }

  return apis;
}

export function findApiByPathAndMethod(
  document: SwaggerDocument,
  path: string,
  method: string,
): ApiItem | undefined {
  const normalizedMethod = normalizeMethod(String(method || ""));
  if (!normalizedMethod || !path) return undefined;

  const pathItem = document?.paths?.[path] as SwaggerPathItem | undefined;
  const operation = pathItem?.[normalizedMethod];
  if (!operation) return undefined;

  const tags = Array.isArray(operation.tags)
    ? operation.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  return {
    key: `${normalizedMethod.toUpperCase()} ${path}`,
    path,
    method: normalizedMethod,
    summary: operation.summary || "",
    description: operation.description || "",
    operationId: operation.operationId || "",
    tags,
  };
}

export function searchApis(document: SwaggerDocument, keyword: string): ApiItem[] {
  const query = String(keyword || "").trim().toLowerCase();
  if (!query) return [];

  return collectApis(document).filter((item) => {
    const text = [
      item.path,
      item.method,
      item.summary,
      item.description,
      item.operationId,
      stringifyTags(item.tags),
    ]
      .join(" ")
      .toLowerCase();

    return text.includes(query);
  });
}
