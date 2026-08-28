import { collectApis, findApiByPathAndMethod, searchApis, type ApiItem } from "../core/api-index.js";
import {
  loadOpenApiDocumentWithCache,
  type OpenApiCacheStatus,
} from "../core/openapi-cache.js";
import type { OpenApiDocument, SwaggerServiceConfig } from "../core/swagger-loader.js";
import {
  loadSwaggerSource,
  type CapturedOpenApiDocument,
  type ResolvedSwaggerSource,
  type SwaggerSource,
} from "../core/swagger-source.js";
import { SwaggerToTS, type GeneratedTypes, type GeneratorOptions } from "../core/swagger-to-ts.js";
import type {
  GenCommandData,
  SearchCommandData,
  SearchResultItem,
  ServiceLoadFailure,
} from "../cli/command-results.js";
import {
  CliProtocolError,
  type ApiSelector,
  type CliProtocolWarning,
  type CliRecoveryCandidate,
  type CliRecoveryCommand,
  type PartialApiSelector,
} from "../cli/protocol.js";

/** Swagger 命令应用层使用的运行设置。 */
export type SwaggerCommandSettings = {
  /** HTTP 请求和浏览器发现超时时间。 */
  timeoutMs: number;

  /** 系统 Chrome 可执行文件路径。 */
  chromePath?: string;

  /** 完整的 TypeScript 生成设置。 */
  generator: Required<GeneratorOptions>;

  /** OpenAPI 文档缓存有效期。 */
  cacheTtlMs: number;

  /** 是否立即向服务端重新校验 OpenAPI 缓存。 */
  refreshCache: boolean;
};

/** Swagger 命令应用层的进度通知接口。 */
export type SwaggerCommandProgress = {
  /** 接收不属于最终结果的进度信息。 */
  report: (message: string) => void;
};

/** 创建命令上下文时使用的输入。 */
export type CreateSwaggerCommandContextInput = {
  /** 用户明确提供的 Swagger 来源。 */
  source: SwaggerSource;

  /** 本次读取和生成使用的运行设置。 */
  settings: SwaggerCommandSettings;

  /** 只加载指定服务；缺省时加载全部服务。 */
  service?: string;

  /** 接收加载进度的可选报告器。 */
  progress?: SwaggerCommandProgress;
};

/** 已加载服务或文档的应用层上下文。 */
export type ServiceDocumentContext = {
  /** 当前上下文包含的 OpenAPI 文档。 */
  document: OpenApiDocument;

  /** OpenAPI 文档的最终地址。 */
  documentUrl: string;

  /** 文档所属服务；单个直接文档来源时为 null。 */
  service: SwaggerServiceConfig | null;

  /** 文档通过本地缓存加载时的状态。 */
  cacheStatus?: OpenApiCacheStatus;
};

/** 一次应用层命令可以使用的全部服务文档。 */
export type SwaggerCommandContext = {
  /** 用户明确提供的 Swagger 来源。 */
  source: SwaggerSource;

  /** 本次读取和生成使用的运行设置。 */
  settings: SwaggerCommandSettings;

  /** 用户指定的服务过滤条件。 */
  service: string | null;

  /** 已成功加载的服务文档。 */
  documents: ServiceDocumentContext[];

  /** 来源中声明的完整服务列表。 */
  services: SwaggerServiceConfig[];

  /** 本次加载失败的服务列表。 */
  failures: ServiceLoadFailure[];
};

/** 应用层搜索接口时使用的输入。 */
export type SearchSwaggerApisInput = {
  /** 用于匹配路径、名称、摘要、标签和描述的关键词。 */
  keyword: string;

  /** 最多返回的匹配结果数量。 */
  limit: number;
};

/** 应用层搜索接口后的结构化结果。 */
export type SearchSwaggerApisResult = {
  /** 可直接交给 CLI 或 MCP 展示层的数据。 */
  data: SearchCommandData;

  /** 部分服务加载失败等非阻断警告。 */
  warnings: CliProtocolWarning[];
};

/** 单个候选 API 与其文档上下文的内部关联。 */
type ServiceApiCandidate = {
  /** API 所属的服务文档上下文。 */
  context: ServiceDocumentContext;

  /** OpenAPI 文档中的接口信息。 */
  api: ApiItem;
};

/** 单个服务文档的加载结果。 */
type ServiceDocumentLoadResult =
  | {
      /** 表示服务文档加载成功。 */
      kind: "success";

      /** 成功加载的服务文档上下文。 */
      context: ServiceDocumentContext;
    }
  | {
      /** 表示服务文档加载失败。 */
      kind: "failure";

      /** 服务文档加载失败的结构化信息。 */
      failure: ServiceLoadFailure;
    };

const API_METHODS = ["get", "post", "put", "delete", "patch"] as const;
const SERVICE_LOAD_CONCURRENCY = 4;
const MAX_RECOVERY_CANDIDATES = 5;
const NO_PROGRESS: SwaggerCommandProgress = { report: () => undefined };

function comparableUrl(url: string): string {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

function findCapturedDocument(
  documents: CapturedOpenApiDocument[],
  documentUrl: string,
): CapturedOpenApiDocument | undefined {
  const expectedUrl = comparableUrl(documentUrl);
  return documents.find((item) => comparableUrl(item.documentUrl) === expectedUrl);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex] as T);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function cacheStatusLabel(status?: OpenApiCacheStatus): string {
  if (status === "hit") return "缓存命中";
  if (status === "validated") return "缓存已校验";
  if (status === "refreshed") return "缓存已更新";
  if (status === "miss") return "网络加载";
  return "页面响应";
}

async function resolveServiceDocuments(
  resolved: ResolvedSwaggerSource,
  service: string | undefined,
  settings: SwaggerCommandSettings,
  progress: SwaggerCommandProgress,
): Promise<Pick<SwaggerCommandContext, "documents" | "services" | "failures">> {
  if (resolved.kind === "openapi") {
    const selectedDocuments = service
      ? resolved.documents.filter((item) => item.title === service)
      : resolved.documents;
    if (selectedDocuments.length === 0) {
      throw new CliProtocolError(
        "SERVICE_NOT_FOUND",
        `未找到文档 "${service}"。可选文档: ${resolved.documents.map((item) => item.title).join(", ")}`,
        { requestedService: service, availableServices: resolved.documents.map((item) => item.title) },
      );
    }
    const services = resolved.documents.map((item) => ({
      name: item.title,
      url: item.documentUrl,
    }));
    return {
      documents: selectedDocuments.map((item) => ({
        document: item.document,
        documentUrl: item.documentUrl,
        service:
          resolved.documents.length > 1 ? { name: item.title, url: item.documentUrl } : null,
      })),
      services,
      failures: [],
    };
  }

  const services = Array.isArray(resolved.config.urls) ? resolved.config.urls : [];
  if (services.length === 0) {
    throw new CliProtocolError("SERVICE_NOT_FOUND", `${resolved.configUrl} 中没有可用服务`, {
      configUrl: resolved.configUrl,
    });
  }
  const selectedServices = service
    ? services.filter((item) => item.name === service)
    : services;
  if (selectedServices.length === 0) {
    throw new CliProtocolError(
      "SERVICE_NOT_FOUND",
      `未找到服务 "${service}"。可选服务: ${services.map((item) => item.name).join(", ")}`,
      { requestedService: service, availableServices: services.map((item) => item.name) },
    );
  }

  if (selectedServices.length > 1) {
    progress.report(`正在加载 ${selectedServices.length} 个服务的 OpenAPI 文档...`);
  }
  let completedServices = 0;
  const showDetailedProgress = selectedServices.length > 1;
  const loadResults = await mapWithConcurrency(
    selectedServices,
    SERVICE_LOAD_CONCURRENCY,
    async (selectedService): Promise<ServiceDocumentLoadResult> => {
      const captured = findCapturedDocument(resolved.capturedDocuments, selectedService.url);
      try {
        const loaded = captured
          ? { document: captured.document, cacheStatus: undefined }
          : await loadOpenApiDocumentWithCache(selectedService.url, {
              timeoutMs: settings.timeoutMs,
              ttlMs: settings.cacheTtlMs,
              refresh: settings.refreshCache,
            });
        completedServices += 1;
        if (showDetailedProgress) {
          progress.report(
            `[${completedServices}/${selectedServices.length}] ${selectedService.name}：${cacheStatusLabel(loaded.cacheStatus)}`,
          );
        }
        return {
          kind: "success",
          context: {
            document: loaded.document,
            documentUrl: selectedService.url,
            service: selectedService,
            cacheStatus: loaded.cacheStatus,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        completedServices += 1;
        if (showDetailedProgress) {
          progress.report(
            `[${completedServices}/${selectedServices.length}] ${selectedService.name}：加载失败`,
          );
        }
        return {
          kind: "failure",
          failure: {
            service: selectedService.name,
            documentUrl: selectedService.url,
            message,
          },
        };
      }
    },
  );
  const documents = loadResults.flatMap((result) =>
    result.kind === "success" ? [result.context] : [],
  );
  const failures = loadResults.flatMap((result) =>
    result.kind === "failure" ? [result.failure] : [],
  );

  if (service && failures.length > 0) {
    const failure = failures[0] as ServiceLoadFailure;
    throw new CliProtocolError(
      "SERVICE_LOAD_FAILED",
      `加载服务 "${failure.service}" 失败: ${failure.message}`,
      failure,
    );
  }
  if (documents.length === 0) {
    throw new CliProtocolError(
      "SERVICE_LOAD_FAILED",
      "所有服务的 OpenAPI 文档均加载失败",
      { failures },
    );
  }

  return { documents, services, failures };
}

/** 加载来源和服务文档，创建可供 CLI 与 MCP 共用的命令上下文。 */
export async function createSwaggerCommandContext(
  input: CreateSwaggerCommandContextInput,
): Promise<SwaggerCommandContext> {
  const progress = input.progress || NO_PROGRESS;
  if (input.source.type === "page") {
    progress.report(`正在通过系统 Chrome 读取页面网络响应: ${input.source.url}`);
  }
  const resolved = await loadSwaggerSource(input.source, input.settings);
  const collection = await resolveServiceDocuments(
    resolved,
    input.service,
    input.settings,
    progress,
  );
  return {
    source: input.source,
    settings: input.settings,
    service: input.service || null,
    ...collection,
  };
}

/** 返回服务文档在搜索和选择时使用的稳定名称。 */
export function serviceDocumentLabel(context: ServiceDocumentContext): string {
  return context.service?.name || String(context.document.info?.title || "").trim() || "default";
}

function createApiSelector(candidate: ServiceApiCandidate): ApiSelector {
  return {
    service: serviceDocumentLabel(candidate.context),
    method: candidate.api.method,
    path: candidate.api.path,
  };
}

function toSearchResultItem(candidate: ServiceApiCandidate): SearchResultItem {
  return {
    service: serviceDocumentLabel(candidate.context),
    documentUrl: candidate.context.documentUrl,
    ...candidate.api,
    selector: createApiSelector(candidate),
  };
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function apiSearchScore(api: ApiItem, keyword: string): number {
  const query = keyword.trim().toLowerCase();
  const pathValue = api.path.toLowerCase();
  const operationId = api.operationId.toLowerCase();
  const summary = api.summary.toLowerCase();
  const description = api.description.toLowerCase();
  const tags = api.tags.join(" ").toLowerCase();

  if (pathValue === query) return 1000;
  if (operationId === query) return 900;
  if (summary === query) return 800;
  if (pathValue.includes(query)) return 600;
  if (operationId.includes(query)) return 500;
  if (summary.includes(query)) return 400;
  if (tags.includes(query)) return 300;
  if (description.includes(query)) return 200;
  return 0;
}

function collectServiceApis(documents: ServiceDocumentContext[]): ServiceApiCandidate[] {
  return documents.flatMap((context) =>
    collectApis(context.document).map((api) => ({ context, api })),
  );
}

function searchServiceApis(
  documents: ServiceDocumentContext[],
  keyword: string,
): ServiceApiCandidate[] {
  const candidates = keyword
    ? documents.flatMap((context) =>
        searchApis(context.document, keyword).map((api) => ({ context, api })),
      )
    : collectServiceApis(documents);
  return candidates.sort((left, right) => {
    const scoreDifference = apiSearchScore(right.api, keyword) - apiSearchScore(left.api, keyword);
    if (scoreDifference !== 0) return scoreDifference;
    return (
      compareText(serviceDocumentLabel(left.context), serviceDocumentLabel(right.context)) ||
      compareText(left.api.path, right.api.path) ||
      compareText(left.api.method, right.api.method) ||
      compareText(left.api.operationId, right.api.operationId)
    );
  });
}

function createServiceFailureWarnings(
  failures: ServiceLoadFailure[],
): CliProtocolWarning[] {
  return failures.map((failure) => ({
    code: "SERVICE_LOAD_FAILED",
    message: `服务 "${failure.service}" 加载失败: ${failure.message}`,
    details: failure,
  }));
}

function sourceOrigin(source: SwaggerSource): string {
  try {
    return new URL(source.url).origin;
  } catch {
    return "";
  }
}

/** 在已加载上下文中检索 API，并返回稳定排序的结构化结果。 */
export function searchSwaggerApis(
  context: SwaggerCommandContext,
  input: SearchSwaggerApisInput,
): SearchSwaggerApisResult {
  const keyword = input.keyword.trim();
  const results = searchServiceApis(context.documents, keyword);
  const returnedResults = results.slice(0, input.limit);
  return {
    data: {
      host: sourceOrigin(context.source),
      service: context.service,
      services: context.services,
      loadedServices: context.documents.length,
      failedServices: context.failures,
      keyword,
      total: results.length,
      returned: returnedResults.length,
      limit: input.limit,
      items: returnedResults.map(toSearchResultItem),
    },
    warnings: createServiceFailureWarnings(context.failures),
  };
}

function recoverySourceUrl(sourceUrl: string): string {
  try {
    const parsedUrl = new URL(sourceUrl);
    const containsCredentials = Boolean(parsedUrl.username || parsedUrl.password);
    const containsSensitiveQuery = [...parsedUrl.searchParams.keys()].some((key) =>
      /token|secret|password|passwd|authorization|api[-_]?key|signature/i.test(key),
    );
    return containsCredentials || containsSensitiveQuery ? "<source-url>" : sourceUrl;
  } catch {
    return "<source-url>";
  }
}

function recoverySource(source: SwaggerSource): SwaggerSource {
  return {
    type: source.type,
    url: recoverySourceUrl(source.url),
  };
}

function createGenRecoveryCommand(
  source: SwaggerSource,
  selector: PartialApiSelector,
): CliRecoveryCommand {
  const args = ["--type", source.type, "--url", recoverySourceUrl(source.url)];
  if (selector.service) args.push("--service", selector.service);
  if (selector.method) args.push("--method", selector.method);
  if (selector.path) args.push("--path", selector.path);
  args.push("--no-interactive", "--format", "json");
  return { command: "gen", args };
}

function levenshteinDistance(left: string, right: string): number {
  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const currentRow = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      currentRow[rightIndex] = Math.min(
        (currentRow[rightIndex - 1] as number) + 1,
        (previousRow[rightIndex] as number) + 1,
        (previousRow[rightIndex - 1] as number) + substitutionCost,
      );
    }
    previousRow.splice(0, previousRow.length, ...currentRow);
  }
  return previousRow[right.length] as number;
}

function createNearestApiCandidates(
  documents: ServiceDocumentContext[],
  method: string,
  pathValue: string,
): ServiceApiCandidate[] {
  const normalizedPath = pathValue.toLowerCase();
  return collectServiceApis(documents)
    .map((candidate) => ({
      candidate,
      exactPath: candidate.api.path === pathValue ? 0 : 1,
      methodMismatch: candidate.api.method === method ? 0 : 1,
      distance: levenshteinDistance(normalizedPath, candidate.api.path.toLowerCase()),
    }))
    .sort((left, right) =>
      left.exactPath - right.exactPath ||
      left.methodMismatch - right.methodMismatch ||
      left.distance - right.distance ||
      compareText(serviceDocumentLabel(left.candidate.context), serviceDocumentLabel(right.candidate.context)) ||
      compareText(left.candidate.api.path, right.candidate.api.path) ||
      compareText(left.candidate.api.method, right.candidate.api.method),
    )
    .slice(0, MAX_RECOVERY_CANDIDATES)
    .map((item) => item.candidate);
}

function createApiRecoveryCandidate(candidate: ServiceApiCandidate): CliRecoveryCandidate {
  return {
    summary:
      candidate.api.summary ||
      candidate.api.description ||
      `${candidate.api.method.toUpperCase()} ${candidate.api.path}`,
    selector: createApiSelector(candidate),
  };
}

function formatTsOutput(parts: GeneratedTypes): string {
  return [
    { title: "模型定义", value: parts.models || "// 无模型定义" },
    { title: "查询参数", value: parts.queryParams || "// 无查询参数" },
    { title: "请求体", value: parts.requestBody || "// 无请求体" },
    { title: "响应数据", value: parts.responseData || "// 无响应数据" },
  ]
    .map((section) => `// ${section.title}\n${section.value.trim()}`)
    .join("\n\n");
}

/** 校验并规范化应用层支持的 HTTP 方法。 */
export function ensureApiMethod(method: string): ApiItem["method"] {
  const normalized = String(method || "").trim().toLowerCase();
  if (!API_METHODS.includes(normalized as (typeof API_METHODS)[number])) {
    throw new CliProtocolError(
      "INVALID_ARGUMENT",
      `无效的 --method "${method}"。可选值: ${API_METHODS.join(", ")}`,
      { option: "method", allowedValues: API_METHODS },
    );
  }
  return normalized as ApiItem["method"];
}

/** 为精确 API 选择器生成 TypeScript，并对歧义与加载失败返回可恢复错误。 */
export function generateSwaggerTypes(
  context: SwaggerCommandContext,
  selector: PartialApiSelector,
): GenCommandData {
  const method = selector.method ? ensureApiMethod(selector.method) : "";
  const pathValue = String(selector.path || "").trim();
  if (!method) {
    throw new CliProtocolError("INVALID_ARGUMENT", "缺少必填参数: --method", {
      requiredOptions: ["method", "path"],
    });
  }
  if (!pathValue) {
    throw new CliProtocolError("INVALID_ARGUMENT", "缺少必填参数: --path", {
      requiredOptions: ["method", "path"],
    });
  }
  if (context.failures.length > 0) {
    const recoveryCandidates = context.documents
      .slice(0, MAX_RECOVERY_CANDIDATES)
      .map((item) => ({
        summary: `在已加载服务 ${serviceDocumentLabel(item)} 中重试`,
        selector: {
          service: serviceDocumentLabel(item),
          method,
          path: pathValue,
        },
      }));
    const recoveryCommands = context.documents
      .slice(0, MAX_RECOVERY_CANDIDATES)
      .map((item) =>
        createGenRecoveryCommand(context.source, {
          service: serviceDocumentLabel(item),
          method,
          path: pathValue,
        }),
      );
    throw new CliProtocolError(
      "INCOMPLETE_SERVICE_LOAD",
      "部分服务加载失败，无法确认目标 API 是否唯一。请使用 --service <name> 指定一个已知服务后重试。",
      {
        failures: context.failures,
        availableServices: context.documents.map(serviceDocumentLabel),
        suggestion: "使用 --service <name> 指定服务后重试",
      },
      {
        action: "retry",
        message: "选择一个已成功加载的服务进行隔离重试。",
        commands: recoveryCommands,
        intent: {
          action: "generate-types",
          source: recoverySource(context.source),
          candidates: recoveryCandidates,
          message: "选择一个已成功加载的服务进行隔离重试。",
        },
      },
    );
  }

  const targetDocuments = selector.service
    ? context.documents.filter(
        (documentContext) => serviceDocumentLabel(documentContext) === selector.service,
      )
    : context.documents;
  if (selector.service && targetDocuments.length === 0) {
    throw new CliProtocolError(
      "SERVICE_NOT_FOUND",
      `未找到服务 "${selector.service}"。可选服务: ${context.documents.map(serviceDocumentLabel).join(", ")}`,
      {
        requestedService: selector.service,
        availableServices: context.documents.map(serviceDocumentLabel),
      },
    );
  }

  const matchedCandidates = targetDocuments.flatMap((documentContext) => {
    const api = findApiByPathAndMethod(documentContext.document, pathValue, method);
    return api ? [{ context: documentContext, api }] : [];
  });
  if (matchedCandidates.length === 0) {
    const pathCandidates = collectServiceApis(targetDocuments).filter(
      (item) => item.api.path === pathValue,
    );
    const nearestCandidates = createNearestApiCandidates(targetDocuments, method, pathValue);
    const recoveryCandidateItems = nearestCandidates.map(createApiRecoveryCandidate);
    const methodTips = pathCandidates.length
      ? ` 该 path 可用方法: ${[...new Set(pathCandidates.map((item) => item.api.method.toUpperCase()))].join(", ")}`
      : "";
    throw new CliProtocolError(
      "API_NOT_FOUND",
      `未找到 API: ${method.toUpperCase()} ${pathValue}.${methodTips}`,
      {
        method,
        path: pathValue,
        availableMethods: [...new Set(pathCandidates.map((item) => item.api.method))],
      },
      {
        action: "select",
        message: pathCandidates.length
          ? "该路径存在其他 HTTP 方法，请从候选 API 中选择。"
          : "请选择最接近的 API 后重试。",
        candidates: recoveryCandidateItems,
        commands: nearestCandidates.map((item) =>
          createGenRecoveryCommand(context.source, createApiSelector(item)),
        ),
        intent:
          recoveryCandidateItems.length > 0
            ? {
                action: "generate-types",
                source: recoverySource(context.source),
                candidates: recoveryCandidateItems,
                message: pathCandidates.length
                  ? "从该路径的可用 HTTP 方法中选择一个接口。"
                  : "从最接近的接口中选择一个后重新生成。",
              }
            : {
                action: "search-api",
                source: recoverySource(context.source),
                keyword: pathValue,
                message: "先按路径关键词搜索接口，再使用返回的精确 selector 生成类型。",
              },
      },
    );
  }
  if (matchedCandidates.length > 1) {
    const recoveryCandidates = matchedCandidates.slice(0, MAX_RECOVERY_CANDIDATES);
    throw new CliProtocolError(
      "AMBIGUOUS_API",
      `多个服务中存在 API ${method.toUpperCase()} ${pathValue}，请使用 --service <name> 指定服务。可选服务: ${matchedCandidates.map((item) => serviceDocumentLabel(item.context)).join(", ")}`,
      { candidates: matchedCandidates.map(createApiSelector) },
      {
        action: "retry",
        message: "请选择目标服务后重新生成。",
        candidates: recoveryCandidates.map(createApiRecoveryCandidate),
        commands: recoveryCandidates.map((item) =>
          createGenRecoveryCommand(context.source, createApiSelector(item)),
        ),
        intent: {
          action: "generate-types",
          source: recoverySource(context.source),
          candidates: recoveryCandidates.map(createApiRecoveryCandidate),
          message: "请选择目标服务后重新生成。",
        },
      },
    );
  }

  const selectedCandidate = matchedCandidates[0] as ServiceApiCandidate;
  const parser = new SwaggerToTS(selectedCandidate.context.document, context.settings.generator);
  const generated = parser.getStructuredTypes(pathValue, method);
  return {
    host: sourceOrigin(context.source),
    service: selectedCandidate.context.service?.name || null,
    documentUrl: selectedCandidate.context.documentUrl,
    selector: createApiSelector(selectedCandidate),
    matchedApi: selectedCandidate.api,
    code: formatTsOutput(generated),
    parts: generated,
  };
}
