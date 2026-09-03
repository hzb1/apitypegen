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

const SEARCH_INTENT_WORDS = [
  "请帮我",
  "帮我",
  "请问",
  "请",
  "查询",
  "查找",
  "搜索",
  "接口",
  "endpoint",
  "api",
  "相关",
  "一下",
];

function normalizeSearchText(value: string): string {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[，。！？、；：,.!?;:()[\]"“”‘’]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchQueryVariants(keyword: string): string[] {
  const normalized = normalizeSearchText(keyword);
  if (!normalized) return [];

  const simplified = SEARCH_INTENT_WORDS.reduce((value, word) => {
    if (word === "api" || word === "endpoint") {
      return value.replace(new RegExp(`\\b${word}\\b`, "gi"), " ");
    }
    return value.replaceAll(word, " ");
  }, normalized)
    .replace(/\s+/g, " ")
    .trim();
  const compact = normalized.replace(/\s+/g, "");
  const variants = [normalized, simplified, compact];
  return [...new Set(variants.filter(Boolean))];
}

function searchableApiText(item: ApiItem): string {
  return normalizeSearchText(
    [item.path, item.method, item.summary, item.description, item.operationId, stringifyTags(item.tags)].join(
      " ",
    ),
  );
}

function scoreApiForQuery(api: ApiItem, query: string): number {
  const pathValue = normalizeSearchText(api.path);
  const operationId = normalizeSearchText(api.operationId);
  const summary = normalizeSearchText(api.summary);
  const description = normalizeSearchText(api.description);
  const tags = normalizeSearchText(api.tags.join(" "));

  if (pathValue === query) return 1000;
  if (operationId === query) return 900;
  if (summary === query) return 800;
  if (pathValue.includes(query)) return 600;
  if (operationId.includes(query)) return 500;
  if (summary.includes(query)) return 400;
  if (tags.includes(query)) return 300;
  if (description.includes(query)) return 200;

  const terms = query.split(" ").filter(Boolean);
  if (terms.length > 1 && terms.every((term) => searchableApiText(api).includes(term))) {
    return 100;
  }
  return 0;
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
  const queries = searchQueryVariants(keyword);
  if (queries.length === 0) return [];

  return collectApis(document).filter((item) => {
    const text = searchableApiText(item);
    return queries.some((query) => {
      const terms = query.split(" ").filter(Boolean);
      return terms.length > 1
        ? terms.every((term) => text.includes(term))
        : text.includes(query);
    });
  });
}

/** 返回 API 对用户关键词的最佳命中分数，用于稳定排序搜索结果。 */
export function scoreApiMatch(api: ApiItem, keyword: string): number {
  return Math.max(...searchQueryVariants(keyword).map((query) => scoreApiForQuery(api, query)), 0);
}
