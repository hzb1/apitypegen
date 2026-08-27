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
 * - `services`：列出来源中包含的服务或文档。
 * - `search`：按关键词检索 API。
 * - `gen`：为指定 API 生成 TypeScript 类型。
 */
type CliCommand = "services" | "search" | "gen";

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

/** 已选择服务或文档后的生成上下文。 */
type ServiceDocumentContext = {
  /** 当前使用的 OpenAPI 文档。 */
  document: OpenApiDocument;

  /** 当前文档的最终地址。 */
  documentUrl: string;

  /** 当前服务；直接文档来源时为 null。 */
  service: SwaggerServiceConfig | null;

  /** 来源中包含的服务列表。 */
  services: SwaggerServiceConfig[];

  /** 当前上下文的解析方式。 */
  source: "openapi" | "service";
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
const COMMON_OPTIONS = ["type", "url", "timeout", "chrome-path", "no-interactive", "format"];
const COMMAND_OPTIONS: Record<CliCommand, Set<string>> = {
  services: new Set(COMMON_OPTIONS),
  search: new Set([...COMMON_OPTIONS, "keyword", "service"]),
  gen: new Set([...COMMON_OPTIONS, "method", "path", "service", "copy"]),
};
const REMOVED_OPTIONS: Record<string, string> = {
  "source-url": "--type ui --url <Swagger-UI-URL>",
  "doc-url": "--type openapi --url <OpenAPI-URL>",
  "swagger-config-url": "--type config --url <swagger-config-URL>",
  host: "--type config --url <swagger-config-URL>",
  version: "直接提供准确的 OpenAPI 或 swagger-config URL",
};

function printHelp(): void {
  process.stdout.write(`ts-swagger 命令行工具

用法:
  ts-swagger services [--type <ui|openapi|config>] [--url <url>] [--format <text|json>]
  ts-swagger search --keyword <text> [--type <ui|openapi|config>] [--url <url>] [--service <name>] [--format <text|json>]
  ts-swagger gen [--type <ui|openapi|config>] [--url <url>] [--method <method>] [--path <api-path>] [--service <name>] [--copy] [--format <ts|json>]

来源类型:
  ui       加载 Swagger UI / Knife4j 页面，读取页面真实发出的 GET 响应
  openapi  直接读取 OpenAPI / Swagger JSON
  config   直接读取 swagger-config JSON

说明:
  - 来源优先级: --type/--url > TS_SWAGGER_TYPE/TS_SWAGGER_URL > ts-swagger.config.json
  - --type 和 --url 必须成对提供；交互终端会询问缺少的部分
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
  if (command === "services" || command === "search" || command === "gen") return command;
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

function formatApiChoice(api: ApiItem): string {
  const summary = api.summary || api.description || "";
  return `${api.method.toUpperCase()} ${api.path}${summary ? `  // ${summary}` : ""}`;
}

async function pickApiInteractively(
  rl: readline.Interface,
  document: OpenApiDocument,
): Promise<ApiItem> {
  const allApis = collectApis(document);
  if (allApis.length === 0) throw new Error("当前文档未找到可用 API。");

  let keyword = "";
  while (true) {
    keyword = await askInput(
      rl,
      "输入 API 关键词（回车列出全部，输入 /关键词 可重新筛选）",
      keyword,
    );
    const candidates = keyword ? searchApis(document, keyword) : allApis;
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
    return displayList[selectedIndex - 1] as ApiItem;
  }
}

function findCapturedDocument(
  documents: CapturedOpenApiDocument[],
  documentUrl: string,
): CapturedOpenApiDocument | undefined {
  return documents.find((item) => item.documentUrl === documentUrl);
}

async function selectCapturedDocument(
  documents: CapturedOpenApiDocument[],
  requestedService: string,
  prompt: readline.Interface | null,
): Promise<CapturedOpenApiDocument> {
  if (requestedService) {
    const matched = documents.find((item) => item.title === requestedService);
    if (matched) return matched;
    throw new Error(
      `未找到文档 "${requestedService}"。可选文档: ${documents.map((item) => item.title).join(", ")}`,
    );
  }
  if (documents.length === 1) return documents[0] as CapturedOpenApiDocument;
  if (prompt) {
    return selectByNumber(
      prompt,
      "检测到多个 OpenAPI 文档，请选择一个:",
      documents,
      (item) => `${item.title} -> ${item.documentUrl}`,
    );
  }
  throw new Error(
    `检测到多个 OpenAPI 文档，请传入 --service <文档标题>。可选文档: ${documents.map((item) => item.title).join(", ")}`,
  );
}

async function resolveServiceDocument(
  resolved: ResolvedSwaggerSource,
  options: CliOptions,
  timeoutMs: number,
  prompt: readline.Interface | null,
): Promise<ServiceDocumentContext> {
  const requestedService = getStringOption(options, "service");
  if (resolved.kind === "openapi") {
    const selected = await selectCapturedDocument(resolved.documents, requestedService, prompt);
    return {
      document: selected.document,
      documentUrl: selected.documentUrl,
      service: resolved.documents.length > 1 ? { name: selected.title, url: selected.documentUrl } : null,
      services: resolved.documents.map((item) => ({ name: item.title, url: item.documentUrl })),
      source: "openapi",
    };
  }

  const services = Array.isArray(resolved.config.urls) ? resolved.config.urls : [];
  if (services.length === 0) throw new Error(`${resolved.configUrl} 中没有可用服务`);

  let selectedService: SwaggerServiceConfig | undefined;
  if (requestedService) {
    selectedService = services.find((item) => item.name === requestedService);
    if (!selectedService) {
      throw new Error(
        `未找到服务 "${requestedService}"。可选服务: ${services.map((item) => item.name).join(", ")}`,
      );
    }
  } else if (services.length === 1) {
    selectedService = services[0];
  } else if (prompt) {
    selectedService = await selectByNumber(
      prompt,
      "检测到多个服务，请选择一个:",
      services,
      (item) => `${item.name} -> ${item.url}`,
    );
  } else {
    throw new Error(
      `检测到多个服务，请传入 --service <name>。可选服务: ${services.map((item) => item.name).join(", ")}`,
    );
  }

  const captured = findCapturedDocument(resolved.capturedDocuments, selectedService.url);
  const document =
    captured?.document || (await loadOpenApiDocumentFromUrl(selectedService.url, timeoutMs));
  return {
    document,
    documentUrl: selectedService.url,
    service: selectedService,
    services,
    source: "service",
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
    throw new Error(`无效的 --method "${method}"。可选值: ${API_METHODS.join(", ")}`);
  }
  return normalized as (typeof API_METHODS)[number];
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

async function runServicesCommand(
  source: SwaggerSource,
  resolved: ResolvedSwaggerSource,
  options: CliOptions,
): Promise<void> {
  const services =
    resolved.kind === "swagger-config"
      ? resolved.config.urls || []
      : resolved.documents.map((item) => ({ name: item.title, url: item.documentUrl }));

  if (getStringOption(options, "format") === "json") {
    process.stdout.write(
      `${JSON.stringify({ host: sourceOrigin(source), services, count: services.length }, null, 2)}\n`,
    );
    return;
  }

  process.stdout.write(`来源: ${source.url}\n`);
  if (services.length === 0) {
    process.stdout.write("未找到服务或文档。\n");
    return;
  }
  services.forEach((service, index) => {
    process.stdout.write(`${index + 1}. ${service.name} -> ${service.url}\n`);
  });
}

async function runSearchCommand(
  source: SwaggerSource,
  resolved: ResolvedSwaggerSource,
  settings: Settings,
  options: CliOptions,
  prompt: readline.Interface | null,
): Promise<void> {
  const keyword = getStringOption(options, "keyword").trim();
  if (!keyword) throw new Error("缺少必填参数: --keyword");
  const context = await resolveServiceDocument(resolved, options, settings.timeoutMs, prompt);
  const results = searchApis(context.document, keyword);

  if (getStringOption(options, "format") === "json") {
    process.stdout.write(
      `${JSON.stringify(
        {
          host: sourceOrigin(source),
          service: context.service?.name || null,
          documentUrl: context.documentUrl,
          keyword,
          count: results.length,
          items: results,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  process.stdout.write(`关键词: ${keyword}\n`);
  if (context.service) process.stdout.write(`服务: ${context.service.name}\n`);
  process.stdout.write(`文档: ${context.documentUrl}\n`);
  if (results.length === 0) {
    process.stdout.write("未匹配到 API。\n");
    return;
  }
  results.forEach((item) => {
    const summary = item.summary || item.description || "";
    process.stdout.write(`${item.method.toUpperCase()} ${item.path}${summary ? `  // ${summary}` : ""}\n`);
  });
}

async function runGenCommand(
  source: SwaggerSource,
  resolved: ResolvedSwaggerSource,
  settings: Settings,
  options: CliOptions,
  prompt: readline.Interface | null,
): Promise<void> {
  const context = await resolveServiceDocument(resolved, options, settings.timeoutMs, prompt);
  let method = getStringOption(options, "method")
    ? ensureMethod(getStringOption(options, "method"))
    : "";
  let pathValue = getStringOption(options, "path").trim();

  if ((!method || !pathValue) && prompt) {
    const selectedApi = await pickApiInteractively(prompt, context.document);
    method = selectedApi.method;
    pathValue = selectedApi.path;
    process.stderr.write(`已选择 API: ${method.toUpperCase()} ${pathValue}\n`);
  }
  if (!method) throw new Error("缺少必填参数: --method");
  if (!pathValue) throw new Error("缺少必填参数: --path");

  const matchedApi = findApiByPathAndMethod(context.document, pathValue, method);
  if (!matchedApi) {
    const candidates = collectApis(context.document).filter((item) => item.path === pathValue);
    const methodTips = candidates.length
      ? ` 该 path 可用方法: ${candidates.map((item) => item.method.toUpperCase()).join(", ")}`
      : "";
    throw new Error(`未找到 API: ${method.toUpperCase()} ${pathValue}.${methodTips}`);
  }

  let outputFormat = getStringOption(options, "format").trim().toLowerCase();
  if (!outputFormat && prompt) {
    outputFormat = await selectByNumber(
      prompt,
      "请选择输出格式:",
      ["ts", "json"],
      (item) => (item === "ts" ? "TypeScript 代码" : "JSON 结构"),
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

  if (outputFormat === "json") {
    process.stdout.write(
      `${JSON.stringify(
        {
          host: sourceOrigin(source),
          service: context.service?.name || null,
          documentUrl: context.documentUrl,
          matchedApi,
          code: tsOutput,
          parts: generated,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(`${tsOutput}\n`);
  }

  if (shouldCopy) {
    if (!copyToClipboard(tsOutput)) {
      throw new Error("复制到剪贴板失败（未检测到 pbcopy / wl-copy / xclip / xsel）");
    }
    process.stderr.write("已复制生成的 TypeScript 到剪贴板。\n");
  }
}

async function main(): Promise<void> {
  const { command: rawCommand, options } = parseArgv(process.argv.slice(2));
  if (!rawCommand || options.help) {
    printHelp();
    return;
  }

  const command = ensureCommand(rawCommand);
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

    if (command === "services") {
      await runServicesCommand(source, resolved, options);
    } else if (command === "search") {
      await runSearchCommand(source, resolved, settings, options, prompt);
    } else {
      await runGenCommand(source, resolved, settings, options, prompt);
    }
  } finally {
    prompt?.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[ts-swagger] ${message}\n`);
  process.exit(1);
});
