#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process, { stdin as input } from "node:process";
import readline from "node:readline/promises";
import { collectApis, findApiByPathAndMethod, searchApis, type ApiItem } from "../core/api-index.js";
import {
  loadOpenApiDocumentWithCache,
  type OpenApiCacheStatus,
} from "../core/openapi-cache.js";
import {
  normalizeBaseUrl,
  type OpenApiDocument,
  type SwaggerServiceConfig,
} from "../core/swagger-loader.js";
import {
  ensureSwaggerSourceType,
  loadSwaggerSource,
  type CapturedOpenApiDocument,
  type ResolvedSwaggerSource,
  type SwaggerSource,
  type SwaggerSourceType,
} from "../core/swagger-source.js";
import { SwaggerToTS, type GeneratedTypes, type GeneratorOptions } from "../core/swagger-to-ts.js";
import {
  type GenCommandResult,
  type GenOutputFormat,
  type SearchCommandResult,
  type SearchOutputFormat,
  type ServiceLoadFailure,
} from "./command-results.js";
import {
  createProgressReporter,
  presentFailure,
  presentGenResult,
  presentSearchResult,
  type CliProgressReporter,
} from "./presenters.js";
import {
  CliProtocolError,
  type ApiSelector,
  type CliCommand,
  type CliProtocolWarning,
  type CliRecoveryCandidate,
  type CliRecoveryCommand,
  type PartialApiSelector,
} from "./protocol.js";
import { reportUnknownCliError } from "./telemetry.js";

/** CLI 参数解析结果中的选项集合。 */
type CliOptions = {
  /** 未归属到选项的普通参数。 */
  _: string[];

  /** 是否显示帮助信息。 */
  help?: boolean;

  /** 按参数名称保存的字符串或布尔值。 */
  [key: string]: string | boolean | string[] | undefined;
};

/** CLI 命令与选项的解析结果。 */
type ParsedArgs = {
  /** 用户输入的命令名称。 */
  command?: string;

  /** 用户输入的命令选项。 */
  options: CliOptions;
};

/** 本地 ts-swagger.config.json 的用户配置。 */
type UserConfig = {
  /** 默认 Swagger 来源。 */
  source?: SwaggerSource;

  /** TypeScript 代码生成配置。 */
  generator?: GeneratorOptions;
};

/** 用户配置文件的读取结果。 */
type UserConfigLoadResult = {
  /** 已解析的用户配置。 */
  config: UserConfig;

  /** 配置文件的绝对路径。 */
  configPath: string;

  /** 配置文件是否存在。 */
  exists: boolean;
};

/** CLI 本次运行使用的公共设置。 */
type Settings = {
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

/** 已加载服务或文档的生成上下文。 */
type ServiceDocumentContext = {
  /** 当前上下文包含的 OpenAPI 文档。 */
  document: OpenApiDocument;

  /** OpenAPI 文档的最终地址。 */
  documentUrl: string;

  /** 文档所属服务；单个直接文档来源时为 null。 */
  service: SwaggerServiceConfig | null;

  /** 文档通过本地缓存加载时的状态。 */
  cacheStatus?: OpenApiCacheStatus;
};

/**
 * 单个服务文档的加载结果。
 *
 * - `success`：服务文档已成功加载。
 * - `failure`：服务文档加载失败，错误已被结构化记录。
 */
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

/** 一次命令加载的全部服务文档。 */
type ServiceDocumentCollection = {
  /** 已加载且可用于检索或生成的文档。 */
  documents: ServiceDocumentContext[];

  /** 来源中包含的服务列表。 */
  services: SwaggerServiceConfig[];

  /** 本次加载中失败的服务列表。 */
  failures: ServiceLoadFailure[];
};

/** 跨服务汇总后的 API 候选项。 */
type ServiceApiCandidate = {
  /** API 所属的服务文档上下文。 */
  context: ServiceDocumentContext;

  /** OpenAPI 文档中的接口信息。 */
  api: ApiItem;
};

/** 来源选择时可能只提供了一部分的 CLI 输入。 */
type PartialSourceInput = {
  /** 用户已提供的来源类型。 */
  type?: SwaggerSourceType;

  /** 用户已提供的来源地址。 */
  url?: string;
};

const DEFAULT_CONFIG = {
  generator: {
    indent: 2,
    useInterface: true,
    addExport: true,
    semicolon: true,
    int64ToString: true,
    showExample: true,
  },
} as const;

const CONFIG_FILENAME = "ts-swagger.config.json";
const API_METHODS = ["get", "post", "put", "delete", "patch"] as const;
const SOURCE_TYPES: SwaggerSourceType[] = ["ui", "openapi", "config"];
const MAX_INTERACTIVE_API_CHOICES = 30;
const SERVICE_LOAD_CONCURRENCY = 4;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;
const MAX_RECOVERY_CANDIDATES = 5;
const OPENAPI_CACHE_TTL_MS = 5 * 60 * 1000;
const COMMON_OPTIONS = [
  "type",
  "url",
  "timeout",
  "chrome-path",
  "no-interactive",
  "format",
  "refresh",
];
const COMMAND_OPTIONS: Record<CliCommand, Set<string>> = {
  search: new Set([...COMMON_OPTIONS, "keyword", "service", "limit"]),
  gen: new Set([...COMMON_OPTIONS, "method", "path", "service", "copy"]),
};
const REMOVED_OPTIONS: Record<string, string> = {
  "source-url": "--type ui --url <Swagger-UI-URL>",
  "doc-url": "--type openapi --url <OpenAPI-URL>",
  "swagger-config-url": "--type config --url <swagger-config-URL>",
  host: "--type config --url <swagger-config-URL>",
  version: "直接提供准确的 OpenAPI 或 swagger-config URL",
};

function requestedCommand(argv: string[]): string {
  const firstArgument = argv[0];
  return firstArgument && !firstArgument.startsWith("-") ? firstArgument : "gen";
}

function wantsJsonOutput(argv: string[]): boolean {
  return argv.some(
    (argument, index) =>
      argument.toLowerCase() === "--format=json" ||
      (argument === "--format" && String(argv[index + 1] || "").toLowerCase() === "json"),
  );
}

function printHelp(): void {
  process.stdout.write(`ts-swagger 命令行工具

用法:
  ts-swagger [gen] [--type <ui|openapi|config>] [--url <url>] [--method <method>] [--path <api-path>] [--service <name>] [--refresh] [--copy] [--format <ts|json>]
  ts-swagger search --keyword <text> [--type <ui|openapi|config>] [--url <url>] [--service <name>] [--limit <1-100>] [--refresh] [--format <text|json>]

来源类型:
  ui       加载 Swagger UI / Knife4j 页面，读取页面真实发出的 GET 响应
  openapi  直接读取 OpenAPI / Swagger JSON
  config   直接读取 swagger-config JSON

说明:
  - 不写命令时默认执行 gen；交互终端会引导选择来源和 API
  - 来源优先级: --type/--url > TS_SWAGGER_TYPE/TS_SWAGGER_URL > ts-swagger.config.json
  - --type 和 --url 必须成对提供；交互终端会询问缺少的部分
  - search/gen 默认加载全部服务；--service 仅用于过滤指定服务
  - search 默认返回前 20 条稳定排序结果，可用 --limit 调整（最大 100）
  - --format json 使用 schemaVersion=1 的稳定成功/失败协议
  - OpenAPI 文档默认缓存 5 分钟；--refresh 会立即向服务端重新校验
  - --no-interactive 可在 AI/CI 脚本中禁用所有交互
  - ui 模式需要系统 Chrome，可用 --chrome-path 或 TS_SWAGGER_CHROME_PATH 指定路径
  - CLI 不会探测或猜测任何 OpenAPI / swagger-config 地址
`);
}

function parseArgv(argv: string[]): ParsedArgs {
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : undefined;
  const rest = command ? argv.slice(1) : argv;
  const options: CliOptions = { _: [] };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token) continue;

    if (!token.startsWith("-")) {
      options._.push(token);
      continue;
    }
    if (token === "-h" || token === "--help") {
      options.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`未知参数 "${token}"`);
    }

    const [rawKey, rawValue] = token.slice(2).split("=", 2);
    const key = rawKey.trim();
    if (!key) continue;

    if (rawValue !== undefined) {
      options[key] = rawValue;
      continue;
    }

    const next = rest[index + 1];
    if (next && !next.startsWith("-")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }

  return { command, options };
}

function ensureCommand(command: string): CliCommand {
  if (command === "search" || command === "gen") return command;
  if (command === "services") {
    throw new Error("命令 services 已删除；search/gen 会默认加载全部服务");
  }
  throw new Error(`未知命令 "${command}"`);
}

function validateCommandOptions(command: CliCommand, options: CliOptions): void {
  if (options._.length > 0) {
    throw new Error(`不支持位置参数: ${options._.join(" ")}`);
  }

  const allowedOptions = COMMAND_OPTIONS[command];
  for (const key of Object.keys(options)) {
    if (key === "_" || key === "help") continue;
    if (key in REMOVED_OPTIONS) {
      throw new Error(`参数 --${key} 已删除，请改用 ${REMOVED_OPTIONS[key]}`);
    }
    if (!allowedOptions.has(key)) {
      throw new Error(`命令 ${command} 不支持参数 --${key}`);
    }
  }
}

function getStringOption(options: CliOptions, key: string): string {
  const value = options[key];
  return typeof value === "string" ? value : "";
}

function getBooleanOption(options: CliOptions, key: string): boolean {
  return options[key] === true;
}

function toInt(value: string, defaultValue: number): number {
  if (value === "") return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

async function loadUserConfig(cwd: string): Promise<UserConfigLoadResult> {
  const configPath = path.join(cwd, CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) return { config: {}, configPath, exists: false };

  try {
    const content = await fsp.readFile(configPath, "utf8");
    const rawConfig = JSON.parse(content) as Record<string, unknown>;
    if ("host" in rawConfig || "version" in rawConfig) {
      throw new Error(
        "host/version 配置已删除，请改用 source.type 和 source.url，并直接提供准确来源地址",
      );
    }
    return { config: rawConfig as UserConfig, configPath, exists: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`读取 ${CONFIG_FILENAME} 失败: ${message}`);
  }
}

function resolveSettings(options: CliOptions, userConfig: UserConfig): Settings {
  const timeoutMs = toInt(getStringOption(options, "timeout"), 15000);
  if (options.refresh !== undefined && options.refresh !== true) {
    throw new CliProtocolError(
      "INVALID_ARGUMENT",
      "--refresh 是布尔开关，不接受参数值",
      { option: "refresh" },
    );
  }
  const chromePath =
    getStringOption(options, "chrome-path") || process.env.TS_SWAGGER_CHROME_PATH || undefined;
  const generator: Required<GeneratorOptions> = {
    ...DEFAULT_CONFIG.generator,
    ...(userConfig.generator || {}),
    typeNameMapper:
      userConfig.generator?.typeNameMapper || ((rawName: string): string => rawName),
  };

  return {
    timeoutMs,
    chromePath,
    generator,
    cacheTtlMs: OPENAPI_CACHE_TTL_MS,
    refreshCache: getBooleanOption(options, "refresh"),
  };
}

function isInteractiveAllowed(options: CliOptions): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY && !getBooleanOption(options, "no-interactive"));
}

function createPrompt(): readline.Interface {
  return readline.createInterface({ input, output: process.stderr });
}

async function askInput(rl: readline.Interface, label: string, defaultValue = ""): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = await rl.question(`${label}${suffix}: `);
  const value = String(answer || "").trim();
  return value || String(defaultValue || "").trim();
}

async function askRequiredInput(rl: readline.Interface, label: string, defaultValue = ""): Promise<string> {
  while (true) {
    const value = await askInput(rl, label, defaultValue);
    if (value) return value;
    process.stderr.write("输入不能为空。\n");
  }
}

async function askYesNo(rl: readline.Interface, label: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  while (true) {
    const answer = await rl.question(`${label} (${hint}): `);
    const normalized = String(answer || "").trim().toLowerCase();
    if (!normalized) return defaultYes;
    if (["y", "yes"].includes(normalized)) return true;
    if (["n", "no"].includes(normalized)) return false;
    process.stderr.write("请输入 y/yes 或 n/no。\n");
  }
}

async function selectByNumber<T>(
  rl: readline.Interface,
  title: string,
  items: readonly T[],
  itemToLabel: (item: T) => string,
): Promise<T> {
  process.stderr.write(`${title}\n`);
  items.forEach((item, index) => process.stderr.write(`${index + 1}. ${itemToLabel(item)}\n`));

  while (true) {
    const answer = await rl.question("请输入编号: ");
    const selectedIndex = Number.parseInt(String(answer).trim(), 10);
    if (Number.isNaN(selectedIndex) || selectedIndex < 1 || selectedIndex > items.length) {
      process.stderr.write("编号无效，请重试。\n");
      continue;
    }
    return items[selectedIndex - 1] as T;
  }
}

function sourceTypeLabel(type: SwaggerSourceType): string {
  const labels: Record<SwaggerSourceType, string> = {
    ui: "Swagger UI / Knife4j 页面",
    openapi: "OpenAPI JSON",
    config: "swagger-config JSON",
  };
  return labels[type];
}

function sourceUrlPrompt(type: SwaggerSourceType): string {
  if (type === "ui") return "请输入 Swagger UI / Knife4j 页面地址";
  if (type === "openapi") return "请输入 OpenAPI JSON 地址";
  return "请输入 swagger-config JSON 地址";
}

async function askSwaggerSource(
  rl: readline.Interface,
  partial: PartialSourceInput = {},
): Promise<SwaggerSource> {
  const type =
    partial.type ||
    (await selectByNumber(rl, "请选择接口文档来源:", SOURCE_TYPES, sourceTypeLabel));
  const url = partial.url || (await askRequiredInput(rl, sourceUrlPrompt(type)));
  return { type, url: normalizeBaseUrl(url) };
}

function normalizeConfiguredSource(source: SwaggerSource, configName: string): SwaggerSource {
  if (!source || typeof source !== "object") {
    throw new Error(`${configName} 缺少有效来源配置`);
  }
  const type = ensureSwaggerSourceType(String(source.type || ""));
  const url = normalizeBaseUrl(String(source.url || ""));
  if (!url) throw new Error(`${configName} 缺少来源 URL`);
  return { type, url };
}

async function resolveSwaggerSourceInput(
  options: CliOptions,
  userConfig: UserConfig,
  prompt: readline.Interface | null,
): Promise<SwaggerSource> {
  const cliTypeValue = getStringOption(options, "type");
  const cliUrlValue = getStringOption(options, "url");
  if (cliTypeValue || cliUrlValue) {
    const partial: PartialSourceInput = {
      type: cliTypeValue ? ensureSwaggerSourceType(cliTypeValue) : undefined,
      url: cliUrlValue ? normalizeBaseUrl(cliUrlValue) : undefined,
    };
    if (partial.type && partial.url) return partial as SwaggerSource;
    if (prompt) return askSwaggerSource(prompt, partial);
    throw new Error("--type 和 --url 必须同时提供");
  }

  const envTypeValue = process.env.TS_SWAGGER_TYPE || "";
  const envUrlValue = process.env.TS_SWAGGER_URL || "";
  if (envTypeValue || envUrlValue) {
    if (!envTypeValue || !envUrlValue) {
      throw new Error("TS_SWAGGER_TYPE 和 TS_SWAGGER_URL 必须同时配置");
    }
    return {
      type: ensureSwaggerSourceType(envTypeValue),
      url: normalizeBaseUrl(envUrlValue),
    };
  }

  if (userConfig.source) {
    return normalizeConfiguredSource(userConfig.source, `${CONFIG_FILENAME}.source`);
  }
  if (prompt) return askSwaggerSource(prompt);
  throw new Error("缺少来源。请同时提供 --type 和 --url，或配置 TS_SWAGGER_TYPE/TS_SWAGGER_URL");
}

function serviceDocumentLabel(context: ServiceDocumentContext): string {
  return (
    context.service?.name ||
    String(context.document.info?.title || "").trim() ||
    "default"
  );
}

function createApiSelector(candidate: ServiceApiCandidate): ApiSelector {
  return {
    service: serviceDocumentLabel(candidate.context),
    method: candidate.api.method,
    path: candidate.api.path,
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
    .sort((left, right) => {
      return (
        left.exactPath - right.exactPath ||
        left.methodMismatch - right.methodMismatch ||
        left.distance - right.distance ||
        compareText(
          serviceDocumentLabel(left.candidate.context),
          serviceDocumentLabel(right.candidate.context),
        ) ||
        compareText(left.candidate.api.path, right.candidate.api.path) ||
        compareText(left.candidate.api.method, right.candidate.api.method)
      );
    })
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

function createServiceFailureWarnings(
  failures: ServiceLoadFailure[],
): CliProtocolWarning[] {
  return failures.map((failure) => ({
    code: "SERVICE_LOAD_FAILED",
    message: `服务 "${failure.service}" 加载失败: ${failure.message}`,
    details: failure,
  }));
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

function formatApiChoice(candidate: ServiceApiCandidate): string {
  const summary = candidate.api.summary || candidate.api.description || "";
  return `[${serviceDocumentLabel(candidate.context)}] ${candidate.api.method.toUpperCase()} ${candidate.api.path}${summary ? `  // ${summary}` : ""}`;
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
  const candidates = documents.flatMap((context) =>
    searchApis(context.document, keyword).map((api) => ({ context, api })),
  );
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

async function pickApiInteractively(
  rl: readline.Interface,
  documents: ServiceDocumentContext[],
): Promise<ServiceApiCandidate> {
  const allApis = collectServiceApis(documents);
  if (allApis.length === 0) {
    throw new CliProtocolError("API_NOT_FOUND", "所有已加载文档中均未找到可用 API。");
  }

  let keyword = "";
  while (true) {
    keyword = await askInput(
      rl,
      "输入 API 关键词（回车列出全部，输入 /关键词 可重新筛选）",
      keyword,
    );
    const candidates = keyword ? searchServiceApis(documents, keyword) : allApis;
    if (candidates.length === 0) {
      process.stderr.write(`关键词 "${keyword}" 未匹配到 API，请换一个关键词。\n`);
      keyword = "";
      continue;
    }

    const displayList = candidates.slice(0, MAX_INTERACTIVE_API_CHOICES);
    if (candidates.length > MAX_INTERACTIVE_API_CHOICES) {
      process.stderr.write(
        `共匹配 ${candidates.length} 个 API，仅显示前 ${MAX_INTERACTIVE_API_CHOICES} 个。\n`,
      );
    }
    process.stderr.write("请选择 API:\n");
    displayList.forEach((item, index) => {
      process.stderr.write(`${index + 1}. ${formatApiChoice(item)}\n`);
    });

    const answer = String(await rl.question("输入 API 编号，或 /新关键词: ")).trim();
    if (answer.startsWith("/")) {
      keyword = answer.slice(1).trim();
      continue;
    }
    const selectedIndex = Number.parseInt(answer, 10);
    if (Number.isNaN(selectedIndex) || selectedIndex < 1 || selectedIndex > displayList.length) {
      process.stderr.write("选择无效，请重试。\n");
      continue;
    }
    return displayList[selectedIndex - 1] as ServiceApiCandidate;
  }
}

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
  options: CliOptions,
  settings: Settings,
  reporter: CliProgressReporter,
): Promise<ServiceDocumentCollection> {
  const requestedService = getStringOption(options, "service");
  if (resolved.kind === "openapi") {
    const selectedDocuments = requestedService
      ? resolved.documents.filter((item) => item.title === requestedService)
      : resolved.documents;
    if (selectedDocuments.length === 0) {
      throw new CliProtocolError(
        "SERVICE_NOT_FOUND",
        `未找到文档 "${requestedService}"。可选文档: ${resolved.documents.map((item) => item.title).join(", ")}`,
        { requestedService, availableServices: resolved.documents.map((item) => item.title) },
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

  const selectedServices = requestedService
    ? services.filter((item) => item.name === requestedService)
    : services;
  if (selectedServices.length === 0) {
    throw new CliProtocolError(
      "SERVICE_NOT_FOUND",
      `未找到服务 "${requestedService}"。可选服务: ${services.map((item) => item.name).join(", ")}`,
      { requestedService, availableServices: services.map((item) => item.name) },
    );
  }

  if (selectedServices.length > 1) {
    reporter.report(`正在加载 ${selectedServices.length} 个服务的 OpenAPI 文档...`);
  }
  let completedServices = 0;
  const showDetailedProgress = selectedServices.length > 1;
  const loadResults = await mapWithConcurrency(
    selectedServices,
    SERVICE_LOAD_CONCURRENCY,
    async (service): Promise<ServiceDocumentLoadResult> => {
      const captured = findCapturedDocument(resolved.capturedDocuments, service.url);
      try {
        const loaded = captured
          ? { document: captured.document, cacheStatus: undefined }
          : await loadOpenApiDocumentWithCache(service.url, {
              timeoutMs: settings.timeoutMs,
              ttlMs: settings.cacheTtlMs,
              refresh: settings.refreshCache,
            });
        completedServices += 1;
        if (showDetailedProgress) {
          reporter.report(
            `[${completedServices}/${selectedServices.length}] ${service.name}：${cacheStatusLabel(loaded.cacheStatus)}`,
          );
        }
        return {
          kind: "success",
          context: {
            document: loaded.document,
            documentUrl: service.url,
            service,
            cacheStatus: loaded.cacheStatus,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        completedServices += 1;
        if (showDetailedProgress) {
          reporter.report(
            `[${completedServices}/${selectedServices.length}] ${service.name}：加载失败`,
          );
        }
        return {
          kind: "failure",
          failure: {
            service: service.name,
            documentUrl: service.url,
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

  if (requestedService && failures.length > 0) {
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

  return {
    documents,
    services,
    failures,
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

function ensureMethod(method: string): (typeof API_METHODS)[number] {
  const normalized = String(method || "").trim().toLowerCase();
  if (!API_METHODS.includes(normalized as (typeof API_METHODS)[number])) {
    throw new CliProtocolError(
      "INVALID_ARGUMENT",
      `无效的 --method "${method}"。可选值: ${API_METHODS.join(", ")}`,
      { option: "method", allowedValues: API_METHODS },
    );
  }
  return normalized as (typeof API_METHODS)[number];
}

function ensureSearchLimit(options: CliOptions): number {
  const value = options.limit;
  if (value === undefined) return DEFAULT_SEARCH_LIMIT;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new CliProtocolError(
      "INVALID_ARGUMENT",
      `--limit 必须是 1 到 ${MAX_SEARCH_LIMIT} 之间的整数`,
      { option: "limit", min: 1, max: MAX_SEARCH_LIMIT },
    );
  }

  const limit = Number.parseInt(value, 10);
  if (limit < 1 || limit > MAX_SEARCH_LIMIT) {
    throw new CliProtocolError(
      "INVALID_ARGUMENT",
      `--limit 必须是 1 到 ${MAX_SEARCH_LIMIT} 之间的整数`,
      { option: "limit", value: limit, min: 1, max: MAX_SEARCH_LIMIT },
    );
  }
  return limit;
}

function ensureSearchOutputFormat(options: CliOptions): SearchOutputFormat {
  const value = options.format;
  if (value === undefined) return "text";
  if (value === "text" || value === "json") return value;
  throw new CliProtocolError(
    "INVALID_ARGUMENT",
    `search 的 --format 仅支持 text 或 json，当前值: ${String(value)}`,
    { option: "format", allowedValues: ["text", "json"] },
  );
}

function ensureGenOutputFormat(value: unknown): GenOutputFormat {
  if (value === undefined || value === "") return "ts";
  if (value === "ts" || value === "json") return value;
  throw new CliProtocolError(
    "INVALID_ARGUMENT",
    `gen 的 --format 仅支持 ts 或 json，当前值: ${String(value)}`,
    { option: "format", allowedValues: ["ts", "json"] },
  );
}

function copyToClipboard(text: string): boolean {
  const runners = [
    { command: "pbcopy", args: [] },
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] },
  ];

  for (const runner of runners) {
    const result = spawnSync(runner.command, runner.args, {
      input: text,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "ignore"],
    });
    if (!result.error && result.status === 0) return true;
  }
  return false;
}

function sourceOrigin(source: SwaggerSource): string {
  try {
    return new URL(source.url).origin;
  } catch {
    return "";
  }
}

async function executeSearchCommand(
  source: SwaggerSource,
  resolved: ResolvedSwaggerSource,
  settings: Settings,
  options: CliOptions,
  reporter: CliProgressReporter,
): Promise<SearchCommandResult> {
  const keyword = getStringOption(options, "keyword").trim();
  if (!keyword) {
    throw new CliProtocolError("INVALID_ARGUMENT", "缺少必填参数: --keyword", {
      requiredOptions: ["keyword"],
    });
  }
  const outputFormat = ensureSearchOutputFormat(options);
  const limit = ensureSearchLimit(options);
  const collection = await resolveServiceDocuments(resolved, options, settings, reporter);
  const warnings = createServiceFailureWarnings(collection.failures);
  const results = searchServiceApis(collection.documents, keyword);
  const returnedResults = results.slice(0, limit);

  return {
    outputFormat,
    data: {
      host: sourceOrigin(source),
      service: getStringOption(options, "service") || null,
      services: collection.services,
      loadedServices: collection.documents.length,
      failedServices: collection.failures,
      keyword,
      total: results.length,
      returned: returnedResults.length,
      limit,
      items: returnedResults.map((item) => ({
        service: serviceDocumentLabel(item.context),
        documentUrl: item.context.documentUrl,
        ...item.api,
        selector: createApiSelector(item),
      })),
    },
    warnings,
  };
}

async function executeGenCommand(
  source: SwaggerSource,
  resolved: ResolvedSwaggerSource,
  settings: Settings,
  options: CliOptions,
  prompt: readline.Interface | null,
  reporter: CliProgressReporter,
): Promise<GenCommandResult> {
  let outputFormat: GenOutputFormat | undefined =
    options.format === undefined ? undefined : ensureGenOutputFormat(options.format);
  const collection = await resolveServiceDocuments(resolved, options, settings, reporter);
  if (collection.failures.length > 0) {
    const requestedMethod = getStringOption(options, "method").trim().toLowerCase();
    const requestedPath = getStringOption(options, "path").trim();
    const recoveryCommands = collection.documents
      .slice(0, MAX_RECOVERY_CANDIDATES)
      .map((item) =>
        createGenRecoveryCommand(source, {
          service: serviceDocumentLabel(item),
          method: requestedMethod || undefined,
          path: requestedPath || undefined,
        }),
      );
    throw new CliProtocolError(
      "INCOMPLETE_SERVICE_LOAD",
      "部分服务加载失败，无法确认目标 API 是否唯一。请使用 --service <name> 指定一个已知服务后重试。",
      {
        failures: collection.failures,
        availableServices: collection.documents.map((item) => serviceDocumentLabel(item)),
        suggestion: "使用 --service <name> 指定服务",
      },
      {
        action: "retry",
        message: "选择一个已成功加载的服务进行隔离重试。",
        commands: recoveryCommands,
      },
    );
  }
  let method = getStringOption(options, "method")
    ? ensureMethod(getStringOption(options, "method"))
    : "";
  let pathValue = getStringOption(options, "path").trim();
  let selectedCandidate: ServiceApiCandidate | undefined;

  if ((!method || !pathValue) && prompt) {
    selectedCandidate = await pickApiInteractively(prompt, collection.documents);
    method = selectedCandidate.api.method;
    pathValue = selectedCandidate.api.path;
    reporter.report(`已选择 API: ${formatApiChoice(selectedCandidate)}`);
  }
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

  if (!selectedCandidate) {
    const matchedCandidates = collection.documents.flatMap((context) => {
      const api = findApiByPathAndMethod(context.document, pathValue, method);
      return api ? [{ context, api }] : [];
    });
    if (matchedCandidates.length === 0) {
      const pathCandidates = collectServiceApis(collection.documents).filter(
        (item) => item.api.path === pathValue,
      );
      const nearestCandidates = createNearestApiCandidates(
        collection.documents,
        method,
        pathValue,
      );
      const methodTips = pathCandidates.length
        ? ` 该 path 可用方法: ${[...new Set(pathCandidates.map((item) => item.api.method.toUpperCase()))].join(", ")}`
        : "";
      throw new CliProtocolError(
        "API_NOT_FOUND",
        `未找到 API: ${method.toUpperCase()} ${pathValue}.${methodTips}`,
        {
          method,
          path: pathValue,
          availableMethods: [
            ...new Set(pathCandidates.map((item) => item.api.method)),
          ],
        },
        {
          action: "select",
          message: pathCandidates.length
            ? "该路径存在其他 HTTP 方法，请从候选 API 中选择。"
            : "请选择最接近的 API 后重试。",
          candidates: nearestCandidates.map(createApiRecoveryCandidate),
          commands: nearestCandidates.map((item) =>
            createGenRecoveryCommand(source, createApiSelector(item)),
          ),
        },
      );
    }
    if (matchedCandidates.length === 1) {
      selectedCandidate = matchedCandidates[0];
    } else if (prompt) {
      selectedCandidate = await selectByNumber(
        prompt,
        "多个服务中存在相同的 API，请选择一个:",
        matchedCandidates,
        formatApiChoice,
      );
    } else {
      const recoveryCandidates = matchedCandidates.slice(0, MAX_RECOVERY_CANDIDATES);
      throw new CliProtocolError(
        "AMBIGUOUS_API",
        `多个服务中存在 API ${method.toUpperCase()} ${pathValue}，请使用 --service <name> 指定服务。可选服务: ${matchedCandidates.map((item) => serviceDocumentLabel(item.context)).join(", ")}`,
        {
          candidates: matchedCandidates.map((item) => createApiSelector(item)),
        },
        {
          action: "retry",
          message: "请选择目标服务，并使用对应参数重新执行 gen。",
          candidates: recoveryCandidates.map(createApiRecoveryCandidate),
          commands: recoveryCandidates.map((item) =>
            createGenRecoveryCommand(source, createApiSelector(item)),
          ),
        },
      );
    }
  }
  const context = selectedCandidate.context;
  const matchedApi = selectedCandidate.api;

  if (!outputFormat && prompt) {
    outputFormat = ensureGenOutputFormat(
      await selectByNumber(
        prompt,
        "请选择输出格式:",
        ["ts", "json"],
        (item) => (item === "ts" ? "TypeScript 代码" : "JSON 结构"),
      ),
    );
  }
  if (!outputFormat) outputFormat = "ts";

  const shouldCopy = getBooleanOption(options, "copy")
    ? true
    : prompt
      ? await askYesNo(prompt, "是否复制生成的 TypeScript 到剪贴板", false)
      : false;
  const parser = new SwaggerToTS(context.document, settings.generator);
  const generated = parser.getStructuredTypes(pathValue, method);
  const tsOutput = formatTsOutput(generated);

  if (shouldCopy && !copyToClipboard(tsOutput)) {
    throw new CliProtocolError(
      "CLIPBOARD_FAILED",
      "复制到剪贴板失败（未检测到 pbcopy / wl-copy / xclip / xsel）",
    );
  }

  return {
    outputFormat,
    data: {
      host: sourceOrigin(source),
      service: context.service?.name || null,
      documentUrl: context.documentUrl,
      selector: createApiSelector(selectedCandidate),
      matchedApi,
      code: tsOutput,
      parts: generated,
    },
    copied: shouldCopy,
  };
}

async function main(argv: string[]): Promise<void> {
  const { command: rawCommand, options } = parseArgv(argv);
  if (options.help) {
    printHelp();
    return;
  }

  const command = rawCommand ? ensureCommand(rawCommand) : "gen";
  validateCommandOptions(command, options);
  const { config } = await loadUserConfig(process.cwd());
  const settings = resolveSettings(options, config);
  const prompt = isInteractiveAllowed(options) ? createPrompt() : null;
  const reporter = createProgressReporter();

  try {
    const source = await resolveSwaggerSourceInput(options, config, prompt);
    if (getStringOption(options, "chrome-path") && source.type !== "ui") {
      throw new Error("--chrome-path 仅能与 --type ui 一起使用");
    }
    if (source.type === "ui") {
      reporter.report(`正在通过系统 Chrome 读取页面网络响应: ${source.url}`);
    }
    const resolved = await loadSwaggerSource(source, settings);

    if (command === "search") {
      const result = await executeSearchCommand(source, resolved, settings, options, reporter);
      presentSearchResult(result);
    } else {
      const result = await executeGenCommand(
        source,
        resolved,
        settings,
        options,
        prompt,
        reporter,
      );
      presentGenResult(result);
    }
  } finally {
    prompt?.close();
  }
}

const cliArgv = process.argv.slice(2);
void main(cliArgv).catch(async (error: unknown) => {
  const normalizedError = presentFailure(
    requestedCommand(cliArgv),
    wantsJsonOutput(cliArgv),
    error,
  );
  process.exitCode = 1;

  if (normalizedError.code === "UNKNOWN_ERROR") {
    await reportUnknownCliError(error, {
      command: requestedCommand(cliArgv),
      errorCode: normalizedError.code,
    });
  }
});
