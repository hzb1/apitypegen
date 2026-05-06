const API_METHODS = ["get", "post", "put", "delete", "patch"];

function stringifyTags(tags) {
  if (!Array.isArray(tags)) return "";
  return tags.filter(Boolean).join(" ");
}

export function collectApis(document) {
  const apis = [];
  const paths = document?.paths || {};

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const method of API_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      apis.push({
        key: `${method.toUpperCase()} ${path}`,
        path,
        method,
        summary: operation.summary || "",
        description: operation.description || "",
        operationId: operation.operationId || "",
        tags: Array.isArray(operation.tags) ? operation.tags : [],
      });
    }
  }

  return apis;
}

export function findApiByPathAndMethod(document, path, method) {
  const normalizedMethod = String(method || "").trim().toLowerCase();
  if (!normalizedMethod || !path) return undefined;
  const operation = document?.paths?.[path]?.[normalizedMethod];
  if (!operation) return undefined;

  return {
    key: `${normalizedMethod.toUpperCase()} ${path}`,
    path,
    method: normalizedMethod,
    summary: operation.summary || "",
    description: operation.description || "",
    operationId: operation.operationId || "",
    tags: Array.isArray(operation.tags) ? operation.tags : [],
  };
}

export function searchApis(document, keyword) {
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
