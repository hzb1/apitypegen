#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process, { stdin as input } from "node:process";
import readline from "node:readline/promises";
import {
  createSwaggerCommandContext,
  generateSwaggerTypes,
  searchSwaggerApis,
  type SwaggerCommandContext,
} from "../application/swagger-commands.js";
import { normalizeBaseUrl } from "../core/swagger-loader.js";
import {
  ensureSwaggerSourceType,
  type SwaggerSource,
  type SwaggerSourceType,
} from "../core/swagger-source.js";
import type { GeneratorOptions } from "../core/swagger-to-ts.js";
import {
  type GenCommandResult,
  type GenOutputFormat,
  type SearchCommandResult,
  type SearchOutputFormat,
  type SearchResultItem,
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
  type CliCommand,
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

/** 本地 APITypeGen 用户配置。 */
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

const CONFIG_FILENAME = "apitypegen.config.json";
const LEGACY_CONFIG_FILENAME = "ts-swagger.config.json";
const API_METHODS = ["get", "post", "put", "delete", "patch"] as const;
const SOURCE_TYPES: SwaggerSourceType[] = ["page", "openapi", "swagger-config"];
const MAX_INTERACTIVE_API_CHOICES = 30;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;
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
  "source-url": "--type page --url <Swagger-UI-URL>",
  "doc-url": "--type openapi --url <OpenAPI-URL>",
  "swagger-config-url": "--type swagger-config --url <swagger-config-URL>",
  host: "--type swagger-config --url <swagger-config-URL>",
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
  process.stdout.write(`APITypeGen 命令行工具

用法:
  apitypegen [gen] [--type <page|openapi|swagger-config>] [--url <url>] [--method <method>] [--path <api-path>] [--service <name>] [--refresh] [--copy] [--format <ts|json>]
  apitypegen search --keyword <text> [--type <page|openapi|swagger-config>] [--url <url>] [--service <name>] [--limit <1-100>] [--refresh] [--format <text|json>]
  apitypegen mcp

来源类型:
  page     接口文档页面（Swagger UI / Knife4j），读取页面真实发出的 GET 响应
  openapi  直接读取 OpenAPI / Swagger JSON
  swagger-config  多服务文档配置 JSON

说明:
  - 不写命令时默认执行 gen；交互终端会引导选择来源和 API
  - 来源优先级: --type/--url > APITYPEGEN_TYPE/APITYPEGEN_URL > apitypegen.config.json
  - 旧 TS_SWAGGER_* 环境变量和 ts-swagger.config.json 仍兼容读取
  - --type 和 --url 必须成对提供；交互终端会询问缺少的部分
  - search/gen 默认加载全部服务；--service 仅用于过滤指定服务
  - search 默认返回前 20 条稳定排序结果，可用 --limit 调整（最大 100）
  - --format json 使用 schemaVersion=1 的稳定成功/失败协议
  - OpenAPI 文档默认缓存 5 分钟；--refresh 会立即向服务端重新校验
  - --no-interactive 可在 AI/CI 脚本中禁用所有交互
  - page 模式需要系统 Chrome，可用 --chrome-path 或 APITYPEGEN_CHROME_PATH 指定路径
  - CLI 不会探测或猜测任何 OpenAPI / swagger-config 地址
  - mcp 通过 stdio 启动 MCP Server，提供 search_apis 和 generate_typescript 工具
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
  const currentConfigPath = path.join(cwd, CONFIG_FILENAME);
  const legacyConfigPath = path.join(cwd, LEGACY_CONFIG_FILENAME);
  const configPath = fs.existsSync(currentConfigPath)
    ? currentConfigPath
    : fs.existsSync(legacyConfigPath)
      ? legacyConfigPath
      : currentConfigPath;
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
    throw new Error(`读取 ${path.basename(configPath)} 失败: ${message}`);
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
    getStringOption(options, "chrome-path") ||
    process.env.APITYPEGEN_CHROME_PATH ||
    process.env.TS_SWAGGER_CHROME_PATH ||
    undefined;
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
    page: "接口文档页面（Swagger UI / Knife4j）",
    openapi: "OpenAPI JSON",
    "swagger-config": "多服务文档配置 JSON（swagger-config）",
  };
  return labels[type];
}

function sourceUrlPrompt(type: SwaggerSourceType): string {
  if (type === "page") return "请输入接口文档页面地址（Swagger UI / Knife4j）";
  if (type === "openapi") return "请输入 OpenAPI JSON 地址";
  return "请输入多服务文档配置 JSON 地址（swagger-config）";
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

  const hasApiTypeGenEnvSource = Boolean(
    process.env.APITYPEGEN_TYPE || process.env.APITYPEGEN_URL,
  );
  const envTypeValue = hasApiTypeGenEnvSource
    ? process.env.APITYPEGEN_TYPE || ""
    : process.env.TS_SWAGGER_TYPE || "";
  const envUrlValue = hasApiTypeGenEnvSource
    ? process.env.APITYPEGEN_URL || ""
    : process.env.TS_SWAGGER_URL || "";
  if (envTypeValue || envUrlValue) {
    if (!envTypeValue || !envUrlValue) {
      throw new Error(
        hasApiTypeGenEnvSource
          ? "APITYPEGEN_TYPE 和 APITYPEGEN_URL 必须同时配置"
          : "TS_SWAGGER_TYPE 和 TS_SWAGGER_URL 必须同时配置",
      );
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
  throw new Error("缺少来源。请同时提供 --type 和 --url，或配置 APITYPEGEN_TYPE/APITYPEGEN_URL");
}

function formatApiChoice(item: SearchResultItem): string {
  const summary = item.summary || item.description || "";
  return `[${item.service}] ${item.method.toUpperCase()} ${item.path}${summary ? `  // ${summary}` : ""}`;
}

async function pickApiInteractively(
  rl: readline.Interface,
  context: SwaggerCommandContext,
): Promise<SearchResultItem> {
  const allApis = searchSwaggerApis(context, {
    keyword: "",
    limit: Number.MAX_SAFE_INTEGER,
  }).data.items;
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
    const candidates = keyword
      ? searchSwaggerApis(context, {
          keyword,
          limit: Number.MAX_SAFE_INTEGER,
        }).data.items
      : allApis;
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
    return displayList[selectedIndex - 1] as SearchResultItem;
  }
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

async function executeSearchCommand(
  context: SwaggerCommandContext,
  options: CliOptions,
): Promise<SearchCommandResult> {
  const keyword = getStringOption(options, "keyword").trim();
  if (!keyword) {
    throw new CliProtocolError("INVALID_ARGUMENT", "缺少必填参数: --keyword", {
      requiredOptions: ["keyword"],
    });
  }
  const outputFormat = ensureSearchOutputFormat(options);
  const limit = ensureSearchLimit(options);
  const result = searchSwaggerApis(context, { keyword, limit });

  return {
    outputFormat,
    data: result.data,
    warnings: result.warnings,
  };
}

async function executeGenCommand(
  commandContext: SwaggerCommandContext,
  options: CliOptions,
  prompt: readline.Interface | null,
  reporter: CliProgressReporter,
): Promise<GenCommandResult> {
  let outputFormat: GenOutputFormat | undefined =
    options.format === undefined ? undefined : ensureGenOutputFormat(options.format);
  let method = getStringOption(options, "method")
    ? ensureMethod(getStringOption(options, "method"))
    : "";
  let pathValue = getStringOption(options, "path").trim();
  let selectedService = getStringOption(options, "service") || undefined;

  if ((!method || !pathValue) && prompt) {
    const selectedApi = await pickApiInteractively(prompt, commandContext);
    selectedService = selectedApi.service;
    method = selectedApi.method;
    pathValue = selectedApi.path;
    reporter.report(`已选择 API: ${formatApiChoice(selectedApi)}`);
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
  const data = generateSwaggerTypes(commandContext, {
    service: selectedService,
    method,
    path: pathValue,
  });

  if (shouldCopy && !copyToClipboard(data.code)) {
    throw new CliProtocolError(
      "CLIPBOARD_FAILED",
      "复制到剪贴板失败（未检测到 pbcopy / wl-copy / xclip / xsel）",
    );
  }

  return {
    outputFormat,
    data,
    copied: shouldCopy,
  };
}

async function main(argv: string[]): Promise<void> {
  if (argv[0] === "mcp") {
    if (argv.length > 1) {
      throw new CliProtocolError("INVALID_ARGUMENT", "mcp 命令不接受额外参数");
    }
    const { startMcpServer } = await import("../mcp/server.js");
    await startMcpServer();
    return;
  }

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
    if (getStringOption(options, "chrome-path") && source.type !== "page") {
      throw new Error("--chrome-path 仅能与 --type page 一起使用");
    }
    const commandContext = await createSwaggerCommandContext({
      source,
      settings,
      service: getStringOption(options, "service") || undefined,
      progress: reporter,
    });

    if (command === "search") {
      const result = await executeSearchCommand(commandContext, options);
      presentSearchResult(result);
    } else {
      const result = await executeGenCommand(
        commandContext,
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
