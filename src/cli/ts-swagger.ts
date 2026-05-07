#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process, { stdin as input } from "node:process";
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { collectApis, findApiByPathAndMethod, searchApis, type ApiItem } from "../core/api-index.js";
import { SwaggerToTS, type GeneratedTypes, type GeneratorOptions } from "../core/swagger-to-ts.js";
import {
  fetchJson,
  findService,
  isOpenApiLike,
  loadOpenApiDocumentByService,
  loadOpenApiDocumentFromUrl,
  loadSwaggerConfig,
  normalizeBaseUrl,
  type OpenApiDocument,
  type SwaggerConfig,
  type SwaggerServiceConfig,
} from "../core/swagger-loader.js";

type CliOptions = {
  _: string[];
  help?: boolean;
  [key: string]: string | boolean | string[] | undefined;
};

type ParsedArgs = {
  command?: string;
  options: CliOptions;
};

type UserConfig = {
  host?: string;
  version?: string;
  generator?: GeneratorOptions;
};

type Settings = {
  host: string;
  version: string;
  timeoutMs: number;
  generator: Required<GeneratorOptions>;
};

type ServiceDocumentContext = {
  document: OpenApiDocument;
  documentUrl: string;
  service: SwaggerServiceConfig | null;
  services: SwaggerServiceConfig[];
  source: "doc-url" | "service";
};

type InteractiveContext = {
  enabled: boolean;
  rl: readline.Interface | null;
};

const DEFAULT_CONFIG = {
  version: "v3",
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
const MAX_INTERACTIVE_API_CHOICES = 30;

function printHelp(): void {
  process.stdout.write(`ts-swagger 命令行工具

用法:
  ts-swagger services [--host <url>] [--version <v3>] [--format <text|json>]
  ts-swagger search --keyword <text> [--service <name>] [--host <url>] [--doc-url <url>] [--format <text|json>]
  ts-swagger gen [--method <method>] [--path <api-path>] [--service <name>] [--host <url>] [--doc-url <url>] [--copy] [--format <ts|json>] [--no-interactive]

说明:
  - host 优先级: --host > TS_SWAGGER_HOST > ts-swagger.config.json
  - 未传 service 且 swagger-config 有多个服务时，会进入交互选择
  - 在 AI/CI 脚本中可使用 --no-interactive 禁用交互
  - --doc-url 会跳过 swagger-config 和服务选择
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

    if (!token.startsWith("--")) continue;

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

function getStringOption(options: CliOptions, key: string): string {
  const value = options[key];
  if (typeof value !== "string") return "";
  return value;
}

function getBooleanOption(options: CliOptions, key: string): boolean {
  return options[key] === true;
}

function toInt(value: string, defaultValue: number): number {
  if (value === "") return defaultValue;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

async function loadUserConfig(cwd: string): Promise<{ config: UserConfig; configPath: string; exists: boolean }> {
  const configPath = path.join(cwd, CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) return { config: {}, configPath, exists: false };

  try {
    const content = await fsp.readFile(configPath, "utf8");
    return { config: JSON.parse(content) as UserConfig, configPath, exists: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`读取 ${CONFIG_FILENAME} 失败: ${message}`);
  }
}

function resolveSettings(options: CliOptions, userConfig: UserConfig): Settings {
  const host =
    getStringOption(options, "host") !== ""
      ? normalizeBaseUrl(getStringOption(options, "host"))
      : normalizeBaseUrl(process.env.TS_SWAGGER_HOST || userConfig.host || "");
  const version = String(getStringOption(options, "version") || userConfig.version || DEFAULT_CONFIG.version);
  const timeoutMs = toInt(getStringOption(options, "timeout"), 15000);
  const generator: Required<GeneratorOptions> = {
    ...DEFAULT_CONFIG.generator,
    ...(userConfig.generator || {}),
    typeNameMapper:
      userConfig.generator?.typeNameMapper ||
      ((rawName: string): string => rawName),
  };

  return { host, version, timeoutMs, generator };
}

function formatTsOutput(parts: GeneratedTypes): string {
  const sections = [
    { title: "模型定义", value: parts.models || "// 无模型定义" },
    { title: "查询参数", value: parts.queryParams || "// 无查询参数" },
    { title: "请求体", value: parts.requestBody || "// 无请求体" },
    { title: "响应数据", value: parts.responseData || "// 无响应数据" },
  ];

  return sections
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
  if (value) return value;
  return defaultValue ? String(defaultValue).trim() : "";
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
  items: T[],
  itemToLabel: (item: T) => string,
): Promise<T> {
  process.stderr.write(`${title}\n`);
  items.forEach((item, index) => {
    process.stderr.write(`${index + 1}. ${itemToLabel(item)}\n`);
  });

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

function formatApiChoice(api: ApiItem): string {
  const summary = api.summary || api.description || "";
  return `${api.method.toUpperCase()} ${api.path}${summary ? `  // ${summary}` : ""}`;
}

async function pickApiInteractively(rl: readline.Interface, document: OpenApiDocument): Promise<ApiItem> {
  const allApis = collectApis(document);
  if (allApis.length === 0) {
    throw new Error("当前文档未找到可用 API。");
  }

  let keyword = "";
  while (true) {
    const keywordInput = await askInput(
      rl,
      "输入 API 关键词（回车列出全部，输入 /关键词 可重新筛选）",
      keyword,
    );
    keyword = keywordInput;

    const candidates = keyword ? searchApis(document, keyword) : allApis;
    if (candidates.length === 0) {
      process.stderr.write(`关键词 "${keyword}" 未匹配到 API，请换一个关键词。\n`);
      keyword = "";
      continue;
    }

    let displayList = candidates;
    if (candidates.length > MAX_INTERACTIVE_API_CHOICES) {
      process.stderr.write(
        `共匹配 ${candidates.length} 个 API，仅显示前 ${MAX_INTERACTIVE_API_CHOICES} 个。可用更精确关键词继续筛选。\n`,
      );
      displayList = candidates.slice(0, MAX_INTERACTIVE_API_CHOICES);
    }

    process.stderr.write("请选择 API:\n");
    displayList.forEach((item, index) => {
      process.stderr.write(`${index + 1}. ${formatApiChoice(item)}\n`);
    });

    const answer = await rl.question("输入 API 编号，或 /新关键词: ");
    const trimmed = String(answer || "").trim();

    if (trimmed.startsWith("/")) {
      keyword = trimmed.slice(1).trim();
      continue;
    }

    const selectedIndex = Number.parseInt(trimmed, 10);
    if (Number.isNaN(selectedIndex) || selectedIndex < 1 || selectedIndex > displayList.length) {
      process.stderr.write("选择无效，请重试。\n");
      continue;
    }

    return displayList[selectedIndex - 1] as ApiItem;
  }
}

async function loadSwaggerConfigByUrl(configUrl: string, timeoutMs = 15000): Promise<SwaggerConfig> {
  const data = await fetchJson<SwaggerConfig>(configUrl, timeoutMs);
  if (!data?.urls || !Array.isArray(data.urls)) {
    throw new Error(`${configUrl} 不是有效的 swagger-config 格式`);
  }
  return data;
}

function isSwaggerConfigLike(data: unknown): data is SwaggerConfig {
  return Boolean(data && typeof data === "object" && Array.isArray((data as SwaggerConfig).urls));
}

function getUrlOrigin(value: string): string {
  try {
    return normalizeBaseUrl(new URL(value).origin);
  } catch {
    return "";
  }
}

async function resolveInteractiveSource(
  rl: readline.Interface,
  settings: Settings,
): Promise<{ host: string; options: Record<string, string> }> {
  const sourceInput = await askRequiredInput(rl, "请输入 OpenAPI 文档 URL / swagger-config URL / Swagger host");
  const sourceUrl = normalizeBaseUrl(sourceInput);
  let directError: Error | undefined;

  try {
    const data = await fetchJson(sourceUrl, settings.timeoutMs);
    if (isOpenApiLike(data)) {
      return { host: "", options: { "doc-url": sourceUrl } };
    }
    if (isSwaggerConfigLike(data)) {
      return {
        host: getUrlOrigin(sourceUrl),
        options: { "swagger-config-url": sourceUrl },
      };
    }
    directError = new Error("返回的 JSON 既不是 OpenAPI 文档，也不是 swagger-config");
  } catch (error) {
    directError = error instanceof Error ? error : new Error(String(error));
  }

  try {
    await loadSwaggerConfig(sourceUrl, settings.version, settings.timeoutMs);
    return { host: sourceUrl, options: {} };
  } catch (hostError) {
    const hostMessage = hostError instanceof Error ? hostError.message : String(hostError);
    throw new Error(
      `无法解析来源地址 "${sourceUrl}"。期望是 OpenAPI JSON、swagger-config JSON 或 Swagger host。直接访问错误: ${directError?.message || "未知错误"}。Host 探测错误: ${hostMessage}`,
    );
  }
}

async function resolveServiceDocument({
  options,
  host,
  version,
  timeoutMs,
  interactiveContext,
}: {
  options: CliOptions;
  host: string;
  version: string;
  timeoutMs: number;
  interactiveContext?: InteractiveContext;
}): Promise<ServiceDocumentContext> {
  const docUrl = getStringOption(options, "doc-url");
  if (docUrl) {
    const document = await loadOpenApiDocumentFromUrl(docUrl, timeoutMs);
    return {
      document,
      documentUrl: docUrl,
      service: null,
      services: [],
      source: "doc-url",
    };
  }

  const swaggerConfigUrl = getStringOption(options, "swagger-config-url");
  const config = swaggerConfigUrl
    ? await loadSwaggerConfigByUrl(swaggerConfigUrl, timeoutMs)
    : await loadSwaggerConfig(host, version, timeoutMs);

  const services = Array.isArray(config.urls) ? config.urls : [];
  if (services.length === 0) {
    throw new Error(`${host} 的 swagger-config 中没有可用服务`);
  }

  let selectedService: SwaggerServiceConfig | undefined;
  const requestedService = getStringOption(options, "service");

  if (requestedService) {
    selectedService = findService(config, requestedService);
    if (!selectedService) {
      const names = services.map((item) => item.name).join(", ");
      throw new Error(`未找到服务 "${requestedService}"。可选服务: ${names}`);
    }
  } else if (services.length === 1) {
    selectedService = services[0];
  } else if (interactiveContext?.enabled && interactiveContext.rl) {
    selectedService = await selectByNumber(
      interactiveContext.rl,
      "检测到多个服务，请选择一个:",
      services,
      (item) => `${item.name} -> ${item.url}`,
    );
  } else {
    const names = services.map((item) => item.name).join(", ");
    throw new Error(`检测到多个服务，请传入 --service <name>。可选服务: ${names}`);
  }

  const { document, documentUrl } = await loadOpenApiDocumentByService({
    host,
    serviceUrl: selectedService.url,
    timeoutMs,
  });

  return {
    document,
    documentUrl,
    service: selectedService,
    services,
    source: "service",
  };
}

function copyToClipboard(text: string): boolean {
  const value = String(text || "");
  if (!value) return false;

  const runners = [
    { command: "pbcopy", args: [] },
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] },
  ];

  for (const runner of runners) {
    const result = spawnSync(runner.command, runner.args, {
      input: value,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "ignore"],
    });
    if (!result.error && result.status === 0) {
      return true;
    }
  }

  return false;
}

async function runServicesCommand(settings: Settings, options: CliOptions): Promise<void> {
  const config = await loadSwaggerConfig(settings.host, settings.version, settings.timeoutMs);
  const services = Array.isArray(config.urls) ? config.urls : [];

  if (getStringOption(options, "format") === "json") {
    process.stdout.write(
      `${JSON.stringify({ host: settings.host, services, count: services.length }, null, 2)}\n`,
    );
    return;
  }

  process.stdout.write(`主机: ${settings.host}\n`);
  if (services.length === 0) {
    process.stdout.write("未找到服务。\n");
    return;
  }

  for (const [index, service] of services.entries()) {
    process.stdout.write(`${index + 1}. ${service.name} -> ${service.url}\n`);
  }
}

async function runSearchCommand(settings: Settings, options: CliOptions): Promise<void> {
  const keyword = String(getStringOption(options, "keyword") || "").trim();
  if (!keyword) {
    throw new Error("缺少必填参数: --keyword");
  }

  const context = await resolveServiceDocument({
    options,
    host: settings.host,
    version: settings.version,
    timeoutMs: settings.timeoutMs,
  });

  const results = searchApis(context.document, keyword);
  if (getStringOption(options, "format") === "json") {
    process.stdout.write(
      `${JSON.stringify(
        {
          host: settings.host,
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
  if (context.service) {
    process.stdout.write(`服务: ${context.service.name}\n`);
  }
  process.stdout.write(`文档: ${context.documentUrl}\n`);

  if (results.length === 0) {
    process.stdout.write("未匹配到 API。\n");
    return;
  }

  for (const item of results) {
    const summary = item.summary || item.description || "";
    process.stdout.write(`${item.method.toUpperCase()} ${item.path}${summary ? `  // ${summary}` : ""}\n`);
  }
}

async function runGenCommand(settings: Settings, options: CliOptions): Promise<void> {
  const interactive = isInteractiveAllowed(options);
  const prompt = interactive ? createPrompt() : null;

  let workingHost = settings.host;
  const workingOptions: CliOptions = { ...options, _: [...options._] };

  try {
    if (!getStringOption(workingOptions, "doc-url") && !workingHost && prompt) {
      const source = await resolveInteractiveSource(prompt, settings);
      workingHost = source.host;
      Object.assign(workingOptions, source.options);
    }

    if (!getStringOption(workingOptions, "doc-url") && !workingHost) {
      throw new Error(
        "缺少 host。请使用 --host、设置 TS_SWAGGER_HOST、配置 ts-swagger.config.json，或改用 --doc-url。",
      );
    }

    const context = await resolveServiceDocument({
      options: workingOptions,
      host: workingHost,
      version: settings.version,
      timeoutMs: settings.timeoutMs,
      interactiveContext: { enabled: interactive, rl: prompt },
    });

    let method = getStringOption(options, "method") ? ensureMethod(getStringOption(options, "method")) : "";
    let pathValue = String(getStringOption(options, "path") || "").trim();

    if ((!method || !pathValue) && prompt) {
      const selectedApi = await pickApiInteractively(prompt, context.document);
      method = selectedApi.method;
      pathValue = selectedApi.path;
      process.stderr.write(`已选择 API: ${method.toUpperCase()} ${pathValue}\n`);
    }

    if (!method) {
      throw new Error("缺少必填参数: --method");
    }
    if (!pathValue) {
      throw new Error("缺少必填参数: --path");
    }

    const matchedApi = findApiByPathAndMethod(context.document, pathValue, method);
    if (!matchedApi) {
      const candidates = collectApis(context.document).filter((item) => item.path === pathValue);
      const methodTips =
        candidates.length > 0
          ? ` 该 path 可用方法: ${candidates.map((item) => item.method.toUpperCase()).join(", ")}`
          : "";
      throw new Error(`未找到 API: ${method.toUpperCase()} ${pathValue}.${methodTips}`);
    }

    let outputFormat = String(getStringOption(options, "format") || "").trim().toLowerCase();
    if (!outputFormat && prompt) {
      const selectedFormat = await selectByNumber(
        prompt,
        "请选择输出格式:",
        ["ts", "json"],
        (item) => (item === "ts" ? "TypeScript 代码" : "JSON 结构"),
      );
      outputFormat = selectedFormat;
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
            host: workingHost || null,
            service: context.service?.name || null,
            documentUrl: context.documentUrl,
            matchedApi,
            code: tsOutput,
            parts: {
              models: generated.models,
              queryParams: generated.queryParams,
              requestBody: generated.requestBody,
              responseData: generated.responseData,
            },
          },
          null,
          2,
        )}\n`,
      );
    } else {
      process.stdout.write(`${tsOutput}\n`);
    }

    if (shouldCopy) {
      const copied = copyToClipboard(tsOutput);
      if (!copied) {
        throw new Error("复制到剪贴板失败（未检测到 pbcopy / wl-copy / xclip / xsel）");
      }
      process.stderr.write("已复制生成的 TypeScript 到剪贴板。\n");
    }
  } finally {
    prompt?.close();
  }
}

async function main(): Promise<void> {
  const { command, options } = parseArgv(process.argv.slice(2));

  if (!command || options.help) {
    printHelp();
    return;
  }

  const { config } = await loadUserConfig(process.cwd());
  const settings = resolveSettings(options, config);
  const needsHost =
    command === "services" ||
    (command === "search" && !getStringOption(options, "doc-url")) ||
    (command === "gen" && !getStringOption(options, "doc-url") && !isInteractiveAllowed(options));

  if (!settings.host && needsHost) {
    throw new Error("缺少 host。请使用 --host、设置 TS_SWAGGER_HOST，或配置 ts-swagger.config.json。");
  }

  if (command === "services") {
    await runServicesCommand(settings, options);
    return;
  }

  if (command === "search") {
    await runSearchCommand(settings, options);
    return;
  }

  if (command === "gen") {
    await runGenCommand(settings, options);
    return;
  }

  throw new Error(`未知命令 "${command}"`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[ts-swagger] ${message}\n`);
  process.exit(1);
});
