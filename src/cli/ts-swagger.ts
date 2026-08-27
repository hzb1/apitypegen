#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process, { stdin as input } from "node:process";
import readline from "node:readline/promises";
import { collectApis, findApiByPathAndMethod, searchApis, type ApiItem } from "../core/api-index.js";
import {
  loadOpenApiDocumentFromUrl,
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

/**
 * CLI 支持的命令。
 *
 * - `search`：按关键词检索 API。
 * - `gen`：为指定 API 生成 TypeScript 类型。
 */
type CliCommand = "search" | "gen";

/**
 * CLI JSON 协议使用的稳定错误码。
 *
 * - `INVALID_COMMAND`：命令不存在或已经删除。
 * - `INVALID_ARGUMENT`：命令参数缺失、冲突或取值无效。
 * - `SOURCE_LOAD_FAILED`：无法读取用户指定的文档来源。
 * - `SOURCE_TIMEOUT`：读取文档来源或浏览器发现超时。
 * - `OPENAPI_INVALID`：响应内容不是有效的 OpenAPI 文档。
 * - `SWAGGER_CONFIG_INVALID`：响应内容不是有效的 swagger-config。
 * - `CHROME_NOT_FOUND`：UI 模式无法找到可用的系统 Chrome。
 * - `SERVICE_NOT_FOUND`：未找到用户指定的服务或文档。
 * - `SERVICE_LOAD_FAILED`：指定服务的 OpenAPI 文档加载失败。
 * - `INCOMPLETE_SERVICE_LOAD`：部分服务加载失败，无法确定生成目标是否唯一。
 * - `API_NOT_FOUND`：已加载文档中不存在指定 API。
 * - `AMBIGUOUS_API`：多个服务中存在相同的 API 标识。
 * - `CLIPBOARD_FAILED`：生成结果无法写入系统剪贴板。
 * - `UNKNOWN_ERROR`：无法归类的内部错误。
 */
type CliErrorCode =
  | "INVALID_COMMAND"
  | "INVALID_ARGUMENT"
  | "SOURCE_LOAD_FAILED"
  | "SOURCE_TIMEOUT"
  | "OPENAPI_INVALID"
  | "SWAGGER_CONFIG_INVALID"
  | "CHROME_NOT_FOUND"
  | "SERVICE_NOT_FOUND"
  | "SERVICE_LOAD_FAILED"
  | "INCOMPLETE_SERVICE_LOAD"
  | "API_NOT_FOUND"
  | "AMBIGUOUS_API"
  | "CLIPBOARD_FAILED"
  | "UNKNOWN_ERROR";

/** CLI JSON 协议中的警告项。 */
type CliProtocolWarning = {
  /** 供调用方稳定判断警告类型的代码。 */
  code: string;

  /** 面向用户展示的警告说明。 */
  message: string;

  /** 与警告相关的可选结构化信息。 */
  details?: unknown;
};

/** CLI JSON 协议的成功响应。 */
type CliProtocolSuccess<T> = {
  /** JSON 协议版本。 */
  schemaVersion: 1;

  /** 表示命令执行成功。 */
  ok: true;

  /** 实际执行的 CLI 命令。 */
  command: CliCommand;

  /** 命令返回的结构化数据。 */
  data: T;

  /** 未阻止命令成功的警告列表。 */
  warnings: CliProtocolWarning[];
};

/** CLI JSON 协议中的错误内容。 */
type CliProtocolErrorDetail = {
  /** 供 AI 或脚本稳定判断错误类型的代码。 */
  code: CliErrorCode;

  /** 面向用户展示的错误说明。 */
  message: string;

  /** 与错误相关的可选结构化信息。 */
  details?: unknown;
};

/** CLI JSON 协议的失败响应。 */
type CliProtocolFailure = {
  /** JSON 协议版本。 */
  schemaVersion: 1;

  /** 表示命令执行失败。 */
  ok: false;

  /** 用户请求执行的命令；省略命令时为 gen。 */
  command: string;

  /** 可供程序稳定处理的错误内容。 */
  error: CliProtocolErrorDetail;
};

/** 搜索结果传递给 gen 命令时使用的 API 选择器。 */
type ApiSelector = {
  /** API 所属服务的名称。 */
  service: string;

  /** API 使用的 HTTP 方法。 */
  method: ApiItem["method"];

  /** API 在 OpenAPI 文档中的路径。 */
  path: string;
};

/**
 * search 命令支持的输出格式。
 *
 * - `text`：输出便于人工阅读的文本。
 * - `json`：输出版本化的 JSON 协议对象。
 */
type SearchOutputFormat = "text" | "json";

/**
 * gen 命令支持的输出格式。
 *
 * - `ts`：直接输出生成的 TypeScript 代码。
 * - `json`：输出包含代码与结构化分段的 JSON 协议对象。
 */
type GenOutputFormat = "ts" | "json";

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
};

/** 已加载服务或文档的生成上下文。 */
type ServiceDocumentContext = {
  /** 当前上下文包含的 OpenAPI 文档。 */
  document: OpenApiDocument;

  /** OpenAPI 文档的最终地址。 */
  documentUrl: string;

  /** 文档所属服务；单个直接文档来源时为 null。 */
  service: SwaggerServiceConfig | null;
};

/** 单个服务文档加载失败后的结构化信息。 */
type ServiceLoadFailure = {
  /** 加载失败的服务名称。 */
  service: string;

  /** 加载失败的 OpenAPI 文档地址。 */
  documentUrl: string;

  /** 服务加载失败的具体原因。 */
  message: string;
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

/** 携带稳定错误码和结构化详情的 CLI 错误。 */
class CliProtocolError extends Error {
  /** 供 AI 或脚本判断错误类型的稳定代码。 */
  readonly code: CliErrorCode;

  /** 与错误相关的可选结构化信息。 */
  readonly details?: unknown;

  constructor(code: CliErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CliProtocolError";
    this.code = code;
    this.details = details;
  }
}

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
const JSON_SCHEMA_VERSION = 1;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;
const COMMON_OPTIONS = ["type", "url", "timeout", "chrome-path", "no-interactive", "format"];
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

function writeProtocolSuccess<T>(
  command: CliCommand,
  data: T,
  warnings: CliProtocolWarning[] = [],
): void {
  const response: CliProtocolSuccess<T> = {
    schemaVersion: JSON_SCHEMA_VERSION,
    ok: true,
    command,
    data,
    warnings,
  };
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
}

function normalizeProtocolError(error: unknown): CliProtocolError {
  if (error instanceof CliProtocolError) return error;

  const message = error instanceof Error ? error.message : String(error);
  if (/命令 services 已删除|未知命令/.test(message)) {
    return new CliProtocolError("INVALID_COMMAND", message);
  }
  if (/无法启动系统 Chrome/.test(message)) {
    return new CliProtocolError("CHROME_NOT_FOUND", message);
  }
  if (/请求超时|超时/.test(message)) {
    return new CliProtocolError("SOURCE_TIMEOUT", message);
  }
  if (/不是有效的 OpenAPI\/Swagger JSON/.test(message)) {
    return new CliProtocolError("OPENAPI_INVALID", message);
  }
  if (/不是有效的 swagger-config JSON/.test(message)) {
    return new CliProtocolError("SWAGGER_CONFIG_INVALID", message);
  }
  if (/未找到服务|未找到文档|没有可用服务/.test(message)) {
    return new CliProtocolError("SERVICE_NOT_FOUND", message);
  }
  if (/加载服务/.test(message)) {
    return new CliProtocolError("SERVICE_LOAD_FAILED", message);
  }
  if (/未找到 API|未找到可用 API/.test(message)) {
    return new CliProtocolError("API_NOT_FOUND", message);
  }
  if (/多个服务中存在 API/.test(message)) {
    return new CliProtocolError("AMBIGUOUS_API", message);
  }
  if (/复制到剪贴板失败/.test(message)) {
    return new CliProtocolError("CLIPBOARD_FAILED", message);
  }
  if (
    /参数|--type|--url|--method|--path|--keyword|--format|--limit|来源配置|缺少来源|配置已删除/.test(
      message,
    )
  ) {
    return new CliProtocolError("INVALID_ARGUMENT", message);
  }
  if (/HTTP \d+|页面已加载|读取 .*失败/.test(message)) {
    return new CliProtocolError("SOURCE_LOAD_FAILED", message);
  }
  return new CliProtocolError("UNKNOWN_ERROR", message);
}

function createProtocolFailure(command: string, error: unknown): CliProtocolFailure {
  const normalizedError = normalizeProtocolError(error);
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    ok: false,
    command,
    error: {
      code: normalizedError.code,
      message: normalizedError.message,
      ...(normalizedError.details === undefined ? {} : { details: normalizedError.details }),
    },
  };
}

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
  ts-swagger [gen] [--type <ui|openapi|config>] [--url <url>] [--method <method>] [--path <api-path>] [--service <name>] [--copy] [--format <ts|json>]
  ts-swagger search --keyword <text> [--type <ui|openapi|config>] [--url <url>] [--service <name>] [--limit <1-100>] [--format <text|json>]

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
  const chromePath =
    getStringOption(options, "chrome-path") || process.env.TS_SWAGGER_CHROME_PATH || undefined;
  const generator: Required<GeneratorOptions> = {
    ...DEFAULT_CONFIG.generator,
    ...(userConfig.generator || {}),
    typeNameMapper:
      userConfig.generator?.typeNameMapper || ((rawName: string): string => rawName),
  };

  return { timeoutMs, chromePath, generator };
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

async function resolveServiceDocuments(
  resolved: ResolvedSwaggerSource,
  options: CliOptions,
  timeoutMs: number,
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
    process.stderr.write(`正在加载 ${selectedServices.length} 个服务的 OpenAPI 文档...\n`);
  }
  const loadResults = await mapWithConcurrency(
    selectedServices,
    SERVICE_LOAD_CONCURRENCY,
    async (service): Promise<ServiceDocumentLoadResult> => {
      const captured = findCapturedDocument(resolved.capturedDocuments, service.url);
      try {
        const document =
          captured?.document || (await loadOpenApiDocumentFromUrl(service.url, timeoutMs));
        return {
          kind: "success",
          context: { document, documentUrl: service.url, service },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
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

async function runSearchCommand(
  source: SwaggerSource,
  resolved: ResolvedSwaggerSource,
  settings: Settings,
  options: CliOptions,
): Promise<void> {
  const keyword = getStringOption(options, "keyword").trim();
  if (!keyword) {
    throw new CliProtocolError("INVALID_ARGUMENT", "缺少必填参数: --keyword", {
      requiredOptions: ["keyword"],
    });
  }
  const outputFormat = ensureSearchOutputFormat(options);
  const limit = ensureSearchLimit(options);
  const collection = await resolveServiceDocuments(resolved, options, settings.timeoutMs);
  const warnings = createServiceFailureWarnings(collection.failures);
  warnings.forEach((warning) => process.stderr.write(`[ts-swagger] 警告: ${warning.message}\n`));
  const results = searchServiceApis(collection.documents, keyword);
  const returnedResults = results.slice(0, limit);

  if (outputFormat === "json") {
    writeProtocolSuccess("search", {
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
    }, warnings);
    return;
  }

  process.stdout.write(`关键词: ${keyword}\n`);
  process.stdout.write(`已加载服务/文档: ${collection.documents.length}\n`);
  if (collection.failures.length > 0) {
    process.stdout.write(`加载失败服务: ${collection.failures.length}\n`);
  }
  process.stdout.write(`匹配结果: ${results.length}，显示: ${returnedResults.length}\n`);
  if (results.length === 0) {
    process.stdout.write("未匹配到 API。\n");
    return;
  }
  returnedResults.forEach((item) => {
    process.stdout.write(`${formatApiChoice(item)}\n`);
  });
}

async function runGenCommand(
  source: SwaggerSource,
  resolved: ResolvedSwaggerSource,
  settings: Settings,
  options: CliOptions,
  prompt: readline.Interface | null,
): Promise<void> {
  let outputFormat: GenOutputFormat | undefined =
    options.format === undefined ? undefined : ensureGenOutputFormat(options.format);
  const collection = await resolveServiceDocuments(resolved, options, settings.timeoutMs);
  if (collection.failures.length > 0) {
    throw new CliProtocolError(
      "INCOMPLETE_SERVICE_LOAD",
      "部分服务加载失败，无法确认目标 API 是否唯一。请使用 --service <name> 指定一个已知服务后重试。",
      {
        failures: collection.failures,
        availableServices: collection.documents.map((item) => serviceDocumentLabel(item)),
        suggestion: "使用 --service <name> 指定服务",
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
    process.stderr.write(`已选择 API: ${formatApiChoice(selectedCandidate)}\n`);
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
      throw new CliProtocolError(
        "AMBIGUOUS_API",
        `多个服务中存在 API ${method.toUpperCase()} ${pathValue}，请使用 --service <name> 指定服务。可选服务: ${matchedCandidates.map((item) => serviceDocumentLabel(item.context)).join(", ")}`,
        {
          candidates: matchedCandidates.map((item) => createApiSelector(item)),
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

  if (outputFormat === "json") {
    writeProtocolSuccess("gen", {
      host: sourceOrigin(source),
      service: context.service?.name || null,
      documentUrl: context.documentUrl,
      selector: createApiSelector(selectedCandidate),
      matchedApi,
      code: tsOutput,
      parts: generated,
    });
  } else {
    process.stdout.write(`${tsOutput}\n`);
  }

  if (shouldCopy) {
    process.stderr.write("已复制生成的 TypeScript 到剪贴板。\n");
  }
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

  try {
    const source = await resolveSwaggerSourceInput(options, config, prompt);
    if (getStringOption(options, "chrome-path") && source.type !== "ui") {
      throw new Error("--chrome-path 仅能与 --type ui 一起使用");
    }
    if (source.type === "ui") {
      process.stderr.write(`正在通过系统 Chrome 读取页面网络响应: ${source.url}\n`);
    }
    const resolved = await loadSwaggerSource(source, settings);

    if (command === "search") {
      await runSearchCommand(source, resolved, settings, options);
    } else {
      await runGenCommand(source, resolved, settings, options, prompt);
    }
  } finally {
    prompt?.close();
  }
}

const cliArgv = process.argv.slice(2);
void main(cliArgv).catch((error: unknown) => {
  const normalizedError = normalizeProtocolError(error);
  if (wantsJsonOutput(cliArgv)) {
    process.stdout.write(
      `${JSON.stringify(createProtocolFailure(requestedCommand(cliArgv), normalizedError), null, 2)}\n`,
    );
  } else {
    process.stderr.write(`[ts-swagger] ${normalizedError.message}\n`);
  }
  process.exitCode = 1;
});
