import type { RequestBody } from "@extension/src/shared/types.ts";
import type { NetworkEntry } from "@extension/src/shared/networkTypes.ts";
import type {
  BodyMode,
  BuildRequestResult,
  KeyValueItem,
  RawBodyType,
  RequestDraft,
  ValidationResult,
} from "./RequestEditor.types.ts";

export type CopyAsFormat = "fetch" | "xhr" | "axios" | "curl";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `kv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createKeyValueItem(seed?: Partial<KeyValueItem>): KeyValueItem {
  return {
    id: seed?.id || createId(),
    key: seed?.key || "",
    value: seed?.value || "",
    enabled: seed?.enabled ?? true,
    description: seed?.description,
  };
}

export function createInitialDraft(seed?: Partial<RequestDraft>): RequestDraft {
  const params = seed?.params?.length ? seed.params : parseUrlToParams(seed?.url || "");
  return {
    method: seed?.method || "GET",
    url: seed?.url || "https://httpbin.org/get",
    params,
    headers: seed?.headers?.length ? seed.headers : [createKeyValueItem({ key: "Accept", value: "application/json" })],
    auth: {
      type: seed?.auth?.type || "none",
      username: seed?.auth?.username,
      password: seed?.auth?.password,
      token: seed?.auth?.token,
    },
    bodyMode: seed?.bodyMode || "none",
    rawBodyType: seed?.rawBodyType || "json",
    bodyRaw: seed?.bodyRaw || "",
    formFields: seed?.formFields?.length ? seed.formFields : [createKeyValueItem()],
    cookieItems: seed?.cookieItems?.length ? seed.cookieItems : [createKeyValueItem()],
    timeoutMs: seed?.timeoutMs ?? 10000,
    includeCredentials: seed?.includeCredentials ?? true,
  };
}

export function parseUrlToParams(url: string): KeyValueItem[] {
  const parsed = safeUrl(url);
  if (!parsed) return [];
  const items: KeyValueItem[] = [];
  parsed.searchParams.forEach((value, key) => {
    items.push(createKeyValueItem({ key, value, enabled: true }));
  });
  return items.length ? items : [createKeyValueItem()];
}

export function mergeParamsToUrl(url: string, params: KeyValueItem[]): string {
  const parsed = safeUrl(url);
  if (!parsed) return url;
  parsed.search = "";

  params.forEach((item) => {
    if (!item.enabled) return;
    const key = item.key.trim();
    if (!key) return;
    parsed.searchParams.append(key, item.value);
  });

  return parsed.toString();
}

export function validateDraft(draft: RequestDraft): ValidationResult {
  const errors: string[] = [];

  if (!draft.url.trim()) {
    errors.push("URL 不能为空");
  } else {
    try {
      new URL(draft.url.trim());
    } catch {
      errors.push("URL 格式不合法");
    }
  }

  if (draft.bodyMode === "raw" && draft.rawBodyType === "json" && canHaveBody(draft.method) && draft.bodyRaw.trim()) {
    try {
      JSON.parse(draft.bodyRaw);
    } catch {
      errors.push("Body JSON 格式不合法");
    }
  }

  if (!Number.isFinite(draft.timeoutMs) || draft.timeoutMs <= 0) {
    errors.push("超时时间必须是正整数");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildRequestSpecFromDraft(draft: RequestDraft): BuildRequestResult {
  const trimmedUrl = draft.url.trim();
  const urlWithParams = mergeParamsToUrl(trimmedUrl, draft.params);
  const headers = buildHeaders(draft);
  const bodyPayload = buildBodyPayload(
    draft.bodyMode,
    draft.rawBodyType,
    draft.bodyRaw,
    draft.formFields,
    headers,
    draft.method,
  );
  const credentials: RequestCredentials = draft.includeCredentials ? "include" : "omit";

  const requestSpec = {
    url: urlWithParams,
    method: draft.method,
    headers: bodyPayload.headers,
    body: bodyPayload.bodySpec,
    timeout: draft.timeoutMs,
    credentials,
  };

  const init: RequestInit = {
    method: draft.method,
    headers: bodyPayload.headers,
    body: bodyPayload.bodyInit,
    credentials,
  };

  return {
    requestSpec,
    init,
  };
}

export function buildCurlCommand(draft: RequestDraft): string {
  const { requestSpec, init } = buildRequestSpecFromDraft(draft);
  const method = (requestSpec.method || "GET").toUpperCase();
  const parts: string[] = ["curl"];

  parts.push("-X", shellEscape(method));
  parts.push(shellEscape(requestSpec.url));

  const headers = (init.headers as Record<string, string>) || {};
  Object.entries(headers).forEach(([name, value]) => {
    parts.push("-H", shellEscape(`${name}: ${value}`));
  });

  if (typeof init.body === "string" && init.body.length > 0) {
    parts.push("--data-raw", shellEscape(init.body));
  }

  return parts.join(" ");
}

export function buildCopySnippet(draft: RequestDraft, format: CopyAsFormat): string {
  if (format === "curl") {
    return buildCurlCommand(draft);
  }

  const { requestSpec, init } = buildRequestSpecFromDraft(draft);
  const method = (requestSpec.method || "GET").toUpperCase();
  const headers = (init.headers as Record<string, string>) || {};
  const body = typeof init.body === "string" ? init.body : "";
  const timeout = draft.timeoutMs;

  if (format === "fetch") {
    const lines: string[] = [];
    lines.push("(async () => {");
    lines.push(`  const response = await fetch(${JSON.stringify(requestSpec.url)}, {`);
    lines.push(`    method: ${JSON.stringify(method)},`);
    if (draft.includeCredentials) {
      lines.push("    credentials: \"include\",");
    }
    if (Object.keys(headers).length) {
      lines.push(`    headers: ${prettyObjectLiteral(headers, 4)},`);
    }
    if (body && method !== "GET" && method !== "HEAD") {
      lines.push(`    body: ${JSON.stringify(body)},`);
    }
    lines.push("  });");
    lines.push("  const contentType = response.headers.get('content-type') || '';");
    lines.push("  const data = contentType.includes('application/json') ? await response.json() : await response.text();");
    lines.push("  console.log({ status: response.status, statusText: response.statusText, data });");
    lines.push("})();");
    return lines.join("\n");
  }

  if (format === "xhr") {
    const lines: string[] = [];
    lines.push("(() => {");
    lines.push("  const xhr = new XMLHttpRequest();");
    lines.push(`  xhr.open(${JSON.stringify(method)}, ${JSON.stringify(requestSpec.url)}, true);`);
    if (draft.includeCredentials) {
      lines.push("  xhr.withCredentials = true;");
    }
    if (timeout > 0) {
      lines.push(`  xhr.timeout = ${timeout};`);
    }
    Object.entries(headers).forEach(([name, value]) => {
      lines.push(`  xhr.setRequestHeader(${JSON.stringify(name)}, ${JSON.stringify(value)});`);
    });
    lines.push("  xhr.onreadystatechange = function () {");
    lines.push("    if (xhr.readyState === XMLHttpRequest.DONE) {");
    lines.push("      let data = xhr.responseText;");
    lines.push("      try { data = JSON.parse(xhr.responseText); } catch { /* keep text */ }");
    lines.push("      console.log({ status: xhr.status, statusText: xhr.statusText, data });");
    lines.push("    }");
    lines.push("  };");
    lines.push("  xhr.onerror = function () {");
    lines.push("    console.error('Network Error');");
    lines.push("  };");
    lines.push("  xhr.ontimeout = function () {");
    lines.push("    console.error('Request Timeout');");
    lines.push("  };");
    lines.push(
      `  xhr.send(${body && method !== "GET" && method !== "HEAD" ? JSON.stringify(body) : "null"});`,
    );
    lines.push("})();");
    return lines.join("\n");
  }

  const axiosMethod = method.toLowerCase();
  const lines: string[] = [];
  lines.push("const response = await axios({");
  lines.push(`  method: ${JSON.stringify(axiosMethod)},`);
  lines.push(`  url: ${JSON.stringify(requestSpec.url)},`);
  if (Object.keys(headers).length) {
    lines.push(`  headers: ${prettyObjectLiteral(headers, 2)},`);
  }
  if (timeout > 0) {
    lines.push(`  timeout: ${timeout},`);
  }
  if (draft.includeCredentials) {
    lines.push("  withCredentials: true,");
  }
  if (body && method !== "GET" && method !== "HEAD") {
    lines.push(`  data: ${JSON.stringify(body)},`);
  }
  lines.push("});");
  lines.push("console.log(response.data);");
  return lines.join("\n");
}

export function draftFromNetworkEntry(entry: NetworkEntry): Partial<RequestDraft> {
  const url = entry.url || "";
  const headers = (entry.request.headers || []).map((item) =>
    createKeyValueItem({
      key: item.name,
      value: item.value,
      enabled: true,
    }),
  );

  const params = parseUrlToParams(url);
  const method = (entry.method || "GET").toUpperCase();
  const body = entry.request.postData;
  const cookieHeader = findHeaderValue(headers, "cookie");

  const next: Partial<RequestDraft> = {
    method,
    url,
    params,
    headers: headers.length ? headers : [createKeyValueItem()],
    auth: { type: "none" },
    timeoutMs: 10000,
    includeCredentials: true,
    cookieItems: parseCookieHeaderToItems(cookieHeader),
    bodyMode: "none",
    rawBodyType: "json",
    bodyRaw: "",
    formFields: [createKeyValueItem()],
  };

  if (!body) return next;

  if (body.json !== undefined) {
    next.bodyMode = "raw";
    next.rawBodyType = "json";
    next.bodyRaw = safeStringify(body.json);
    return next;
  }

  if (body.params?.length) {
    next.bodyMode = "x-www-form-urlencoded";
    next.formFields = body.params.map((item) =>
      createKeyValueItem({
        key: item.name,
        value: item.value,
        enabled: true,
      }),
    );
    return next;
  }

  if (body.text !== undefined) {
    const contentType = findHeaderValue(headers, "content-type").toLowerCase();
    next.bodyMode = inferBodyModeByContentType(contentType);
    if (next.bodyMode === "raw") {
      next.rawBodyType = inferRawTypeByContentType(contentType);
      next.bodyRaw = next.rawBodyType === "json" ? normalizeJsonText(body.text) : body.text;
    } else {
      next.bodyRaw = body.text;
    }
  }

  return next;
}

function buildHeaders(draft: RequestDraft): Record<string, string> {
  const headers: Record<string, string> = {};

  draft.headers.forEach((item) => {
    if (!item.enabled) return;
    const key = item.key.trim();
    if (!key) return;
    headers[key] = item.value;
  });

  const cookieHeader = buildCookieHeaderValue(draft.cookieItems);
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  if (draft.auth.type === "bearer" && draft.auth.token?.trim()) {
    headers.Authorization = `Bearer ${draft.auth.token.trim()}`;
  }

  if (
    draft.auth.type === "basic" &&
    draft.auth.username?.trim() &&
    typeof draft.auth.password === "string"
  ) {
    headers.Authorization = `Basic ${btoa(`${draft.auth.username}:${draft.auth.password}`)}`;
  }

  return headers;
}

function buildBodyPayload(
  bodyMode: BodyMode,
  rawBodyType: RawBodyType,
  bodyRaw: string,
  formFields: KeyValueItem[],
  headers: Record<string, string>,
  method: string,
): {
  headers: Record<string, string>;
  bodySpec?: RequestBody;
  bodyInit?: BodyInit;
} {
  if (!canHaveBody(method) || bodyMode === "none") {
    return { headers };
  }

  const nextHeaders = { ...headers };

  if (bodyMode === "raw") {
    if (!hasHeader(nextHeaders, "content-type")) {
      nextHeaders["Content-Type"] = rawBodyType === "json"
        ? "application/json"
        : rawBodyType === "xml"
          ? "application/xml"
          : "text/plain";
    }
    return {
      headers: nextHeaders,
      bodySpec: {
        type: rawBodyType === "json" ? "json" : "text",
        value: rawBodyType === "json" ? (bodyRaw.trim() ? JSON.parse(bodyRaw) : {}) : bodyRaw,
      },
      bodyInit: rawBodyType === "json" ? (bodyRaw.trim() ? bodyRaw : "{}") : bodyRaw,
    };
  }

  if (bodyMode === "x-www-form-urlencoded" || bodyMode === "form-data") {
    const form: Record<string, string> = {};
    formFields.forEach((item) => {
      if (!item.enabled) return;
      const key = item.key.trim();
      if (!key) return;
      form[key] = item.value;
    });

    if (!hasHeader(nextHeaders, "content-type") && bodyMode === "x-www-form-urlencoded") {
      nextHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    }

    return {
      headers: nextHeaders,
      bodySpec: {
        type: "form",
        value: form,
      },
      bodyInit:
        bodyMode === "x-www-form-urlencoded"
          ? new URLSearchParams(form).toString()
          : buildFormData(form),
    };
  }

  if (bodyMode === "binary") {
    if (!hasHeader(nextHeaders, "content-type")) {
      nextHeaders["Content-Type"] = "application/octet-stream";
    }
    return {
      headers: nextHeaders,
      bodySpec: {
        type: "text",
        value: bodyRaw,
      },
      bodyInit: bodyRaw,
    };
  }

  return { headers: nextHeaders };
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

function canHaveBody(method: string): boolean {
  const upper = method.toUpperCase();
  return upper !== "GET" && upper !== "HEAD";
}

function safeUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function shellEscape(input: string): string {
  return `'${input.replace(/'/g, `'"'"'`)}'`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeJsonText(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function findHeaderValue(headers: KeyValueItem[], name: string): string {
  const lowerName = name.toLowerCase();
  const hit = headers.find((item) => item.key.toLowerCase() === lowerName);
  return hit?.value || "";
}

function prettyObjectLiteral(input: Record<string, string>, indentLevel = 0): string {
  const space = " ".repeat(indentLevel);
  const entries = Object.entries(input);
  if (!entries.length) return "{}";

  const lines = entries.map(([key, value]) => `${space}  ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  return `\n${space}{\n${lines.join(",\n")}\n${space}}`.trimStart();
}

function buildCookieHeaderValue(items: KeyValueItem[]): string {
  const pairs = items
    .filter((item) => item.enabled && item.key.trim())
    .map((item) => `${item.key.trim()}=${item.value}`);
  return pairs.join("; ");
}

function parseCookieHeaderToItems(cookieHeader: string): KeyValueItem[] {
  if (!cookieHeader.trim()) return [createKeyValueItem()];
  const items = cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const index = chunk.indexOf("=");
      if (index <= 0) {
        return createKeyValueItem({ key: chunk, value: "", enabled: true });
      }
      return createKeyValueItem({
        key: chunk.slice(0, index).trim(),
        value: chunk.slice(index + 1).trim(),
        enabled: true,
      });
    });
  return items.length ? items : [createKeyValueItem()];
}

function inferBodyModeByContentType(contentType: string): BodyMode {
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return "x-www-form-urlencoded";
  }
  if (contentType.includes("multipart/form-data")) {
    return "form-data";
  }
  if (contentType.includes("application/octet-stream")) {
    return "binary";
  }
  return "raw";
}

function inferRawTypeByContentType(contentType: string): RawBodyType {
  if (contentType.includes("json")) return "json";
  if (contentType.includes("xml")) return "xml";
  return "text";
}

function buildFormData(form: Record<string, string>): FormData {
  const formData = new FormData();
  Object.entries(form).forEach(([key, value]) => {
    formData.append(key, value);
  });
  return formData;
}
