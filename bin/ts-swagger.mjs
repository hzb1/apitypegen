#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input } from "node:process";
import { collectApis, findApiByPathAndMethod, searchApis } from "../src/core/api-index.js";
import { SwaggerToTS } from "../src/core/swagger-to-ts.js";
import {
  fetchJson,
  findService,
  isLikelyDocumentUrl,
  loadOpenApiDocumentByService,
  loadOpenApiDocumentFromUrl,
  loadSwaggerConfig,
  normalizeBaseUrl,
} from "../src/core/swagger-loader.js";

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
};

const CONFIG_FILENAME = "ts-swagger.config.json";
const API_METHODS = ["get", "post", "put", "delete", "patch"];
const MAX_INTERACTIVE_API_CHOICES = 30;

function printHelp() {
  process.stdout.write(`ts-swagger CLI

Usage:
  ts-swagger services [--host <url>] [--version <v3>] [--format <text|json>]
  ts-swagger search --keyword <text> [--service <name>] [--host <url>] [--doc-url <url>] [--format <text|json>]
  ts-swagger gen [--method <method>] [--path <api-path>] [--service <name>] [--host <url>] [--doc-url <url>] [--copy] [--format <ts|json>] [--no-interactive]

Notes:
  - host priority: --host > TS_SWAGGER_HOST > ts-swagger.config.json
  - service is selected interactively when omitted and swagger-config contains multiple services
  - use --no-interactive in AI/CI scripts to disable prompts
  - --doc-url bypasses swagger-config and service selection
`);
}

function parseArgv(argv) {
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : undefined;
  const rest = command ? argv.slice(1) : argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token.startsWith("-")) {
      if (!options._) options._ = [];
      options._.push(token);
      continue;
    }

    if (token === "-h" || token === "--help") {
      options.help = true;
      continue;
    }

    if (token.startsWith("--")) {
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
  }

  return { command, options };
}

function toInt(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

async function loadUserConfig(cwd) {
  const configPath = path.join(cwd, CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) return { config: {}, configPath, exists: false };

  try {
    const content = await fsp.readFile(configPath, "utf8");
    return { config: JSON.parse(content), configPath, exists: true };
  } catch (error) {
    throw new Error(`Failed to read ${CONFIG_FILENAME}: ${error.message}`);
  }
}

function resolveSettings(options, userConfig) {
  const host =
    options.host !== undefined
      ? normalizeBaseUrl(options.host)
      : normalizeBaseUrl(process.env.TS_SWAGGER_HOST || userConfig.host || "");
  const version = String(options.version || userConfig.version || DEFAULT_CONFIG.version);
  const timeoutMs = toInt(options.timeout, 15000);
  const generator = {
    ...DEFAULT_CONFIG.generator,
    ...(userConfig.generator || {}),
  };

  return { host, version, timeoutMs, generator };
}

function formatTsOutput(parts) {
  const sections = [
    { title: "Models", value: parts.models || "// 无 Models" },
    { title: "Query Params", value: parts.queryParams || "// 无查询参数" },
    { title: "Request Body", value: parts.requestBody || "// 无 Request Body" },
    { title: "Response Data", value: parts.responseData || "// 无 Response Data" },
  ];

  return sections
    .map((section) => `// ${section.title}\n${section.value.trim()}`)
    .join("\n\n");
}

function ensureMethod(method) {
  const normalized = String(method || "").trim().toLowerCase();
  if (!API_METHODS.includes(normalized)) {
    throw new Error(`Invalid --method "${method}". Allowed: ${API_METHODS.join(", ")}`);
  }
  return normalized;
}

function isInteractiveAllowed(options) {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY && !options["no-interactive"]);
}

function createPrompt() {
  return readline.createInterface({ input, output: process.stderr });
}

async function askInput(rl, label, defaultValue = "") {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = await rl.question(`${label}${suffix}: `);
  const value = String(answer || "").trim();
  if (value) return value;
  return defaultValue ? String(defaultValue).trim() : "";
}

async function askRequiredInput(rl, label, defaultValue = "") {
  while (true) {
    const value = await askInput(rl, label, defaultValue);
    if (value) return value;
    process.stderr.write("Input cannot be empty.\n");
  }
}

async function askYesNo(rl, label, defaultYes = false) {
  const hint = defaultYes ? "Y/n" : "y/N";
  while (true) {
    const answer = await rl.question(`${label} (${hint}): `);
    const normalized = String(answer || "").trim().toLowerCase();
    if (!normalized) return defaultYes;
    if (["y", "yes"].includes(normalized)) return true;
    if (["n", "no"].includes(normalized)) return false;
    process.stderr.write("Please answer with y/yes or n/no.\n");
  }
}

async function selectByNumber(rl, title, items, itemToLabel) {
  process.stderr.write(`${title}\n`);
  items.forEach((item, index) => {
    process.stderr.write(`${index + 1}. ${itemToLabel(item)}\n`);
  });

  while (true) {
    const answer = await rl.question("Enter number: ");
    const selectedIndex = Number.parseInt(String(answer).trim(), 10);
    if (Number.isNaN(selectedIndex) || selectedIndex < 1 || selectedIndex > items.length) {
      process.stderr.write("Invalid number, try again.\n");
      continue;
    }
    return items[selectedIndex - 1];
  }
}

function formatApiChoice(api) {
  const summary = api.summary || api.description || "";
  return `${api.method.toUpperCase()} ${api.path}${summary ? `  // ${summary}` : ""}`;
}

async function pickApiInteractively(rl, document) {
  const allApis = collectApis(document);
  if (allApis.length === 0) {
    throw new Error("No API found in current document.");
  }

  let keyword = "";
  while (true) {
    const keywordInput = await askInput(
      rl,
      "Search API keyword (press Enter to list all, use /keyword to refine later)",
      keyword,
    );
    keyword = keywordInput;

    const candidates = keyword ? searchApis(document, keyword) : allApis;
    if (candidates.length === 0) {
      process.stderr.write(`No matched API for keyword "${keyword}". Try another keyword.\n`);
      keyword = "";
      continue;
    }

    let displayList = candidates;
    if (candidates.length > MAX_INTERACTIVE_API_CHOICES) {
      process.stderr.write(
        `Matched ${candidates.length} APIs, showing first ${MAX_INTERACTIVE_API_CHOICES}. Refine keyword if needed.\n`,
      );
      displayList = candidates.slice(0, MAX_INTERACTIVE_API_CHOICES);
    }

    process.stderr.write("Select API:\n");
    displayList.forEach((item, index) => {
      process.stderr.write(`${index + 1}. ${formatApiChoice(item)}\n`);
    });

    const answer = await rl.question("Enter API number or /new-keyword: ");
    const trimmed = String(answer || "").trim();

    if (trimmed.startsWith("/")) {
      keyword = trimmed.slice(1).trim();
      continue;
    }

    const selectedIndex = Number.parseInt(trimmed, 10);
    if (
      Number.isNaN(selectedIndex) ||
      selectedIndex < 1 ||
      selectedIndex > displayList.length
    ) {
      process.stderr.write("Invalid selection. Please retry.\n");
      continue;
    }

    return displayList[selectedIndex - 1];
  }
}

async function loadSwaggerConfigByUrl(configUrl, timeoutMs = 15000) {
  const data = await fetchJson(configUrl, timeoutMs);
  if (!data?.urls || !Array.isArray(data.urls)) {
    throw new Error(`Invalid swagger-config format at ${configUrl}`);
  }
  return data;
}

async function resolveServiceDocument({ options, host, version, timeoutMs, interactiveContext }) {
  if (options["doc-url"]) {
    const documentUrl = String(options["doc-url"]);
    const document = await loadOpenApiDocumentFromUrl(documentUrl, timeoutMs);
    return {
      document,
      documentUrl,
      service: null,
      services: [],
      source: "doc-url",
    };
  }

  let config;
  if (options["swagger-config-url"]) {
    config = await loadSwaggerConfigByUrl(String(options["swagger-config-url"]), timeoutMs);
  } else {
    config = await loadSwaggerConfig(host, version, timeoutMs);
  }

  const services = Array.isArray(config.urls) ? config.urls : [];
  if (services.length === 0) {
    throw new Error(`swagger-config at ${host} has no available services`);
  }

  let selectedService;
  const requestedService = options.service;

  if (requestedService) {
    selectedService = findService(config, requestedService);
    if (!selectedService) {
      const names = services.map((item) => item.name).join(", ");
      throw new Error(`Service "${requestedService}" not found. Available services: ${names}`);
    }
  } else if (services.length === 1) {
    selectedService = services[0];
  } else if (interactiveContext?.enabled && interactiveContext.rl) {
    selectedService = await selectByNumber(
      interactiveContext.rl,
      "Detected multiple services. Select one:",
      services,
      (item) => `${item.name} -> ${item.url}`,
    );
  } else {
    const names = services.map((item) => item.name).join(", ");
    throw new Error(
      `Multiple services found. Pass --service <name>. Available services: ${names}`,
    );
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

function copyToClipboard(text) {
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

async function runServicesCommand(settings, options) {
  const config = await loadSwaggerConfig(settings.host, settings.version, settings.timeoutMs);
  const services = Array.isArray(config.urls) ? config.urls : [];
  if (options.format === "json") {
    process.stdout.write(
      `${JSON.stringify({ host: settings.host, services, count: services.length }, null, 2)}\n`,
    );
    return;
  }

  process.stdout.write(`Host: ${settings.host}\n`);
  if (services.length === 0) {
    process.stdout.write("No service found.\n");
    return;
  }

  for (const [index, service] of services.entries()) {
    process.stdout.write(`${index + 1}. ${service.name} -> ${service.url}\n`);
  }
}

async function runSearchCommand(settings, options) {
  const keyword = String(options.keyword || "").trim();
  if (!keyword) {
    throw new Error("Missing required argument: --keyword");
  }

  const context = await resolveServiceDocument({
    options,
    host: settings.host,
    version: settings.version,
    timeoutMs: settings.timeoutMs,
  });

  const results = searchApis(context.document, keyword);
  if (options.format === "json") {
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

  process.stdout.write(`Keyword: ${keyword}\n`);
  if (context.service) {
    process.stdout.write(`Service: ${context.service.name}\n`);
  }
  process.stdout.write(`Document: ${context.documentUrl}\n`);

  if (results.length === 0) {
    process.stdout.write("No matched API.\n");
    return;
  }

  for (const item of results) {
    const summary = item.summary || item.description || "";
    process.stdout.write(
      `${item.method.toUpperCase()} ${item.path}${summary ? `  // ${summary}` : ""}\n`,
    );
  }
}

async function runGenCommand(settings, options) {
  const interactive = isInteractiveAllowed(options);
  const prompt = interactive ? createPrompt() : null;

  let workingHost = settings.host;
  const workingOptions = { ...options };

  try {
    if (!workingOptions["doc-url"] && !workingHost && prompt) {
      const sourceInput = await askRequiredInput(
        prompt,
        "Swagger host / swagger-config URL / OpenAPI doc URL",
      );
      const normalizedSourceInput = normalizeBaseUrl(sourceInput);
      const looksLikeDocUrl = isLikelyDocumentUrl(normalizedSourceInput);

      if (/swagger-config/i.test(sourceInput)) {
        workingOptions["swagger-config-url"] = sourceInput;
        try {
          const sourceUrl = new URL(sourceInput);
          workingHost = normalizeBaseUrl(sourceUrl.origin);
        } catch {
          workingHost = "";
        }
      } else if (looksLikeDocUrl) {
        try {
          await loadOpenApiDocumentFromUrl(normalizedSourceInput, settings.timeoutMs);
        } catch (error) {
          throw new Error(
            `Unable to load OpenAPI document from ${normalizedSourceInput}: ${error.message}`,
          );
        }
        workingOptions["doc-url"] = normalizedSourceInput;
      } else {
        workingHost = normalizedSourceInput;
      }
    }

    if (!workingOptions["doc-url"] && !workingHost) {
      throw new Error(
        "Host is required. Provide --host, set TS_SWAGGER_HOST, configure ts-swagger.config.json, or use --doc-url.",
      );
    }

    const context = await resolveServiceDocument({
      options: workingOptions,
      host: workingHost,
      version: settings.version,
      timeoutMs: settings.timeoutMs,
      interactiveContext: { enabled: interactive, rl: prompt },
    });

    let method = options.method ? ensureMethod(options.method) : "";
    let pathValue = String(options.path || "").trim();

    if ((!method || !pathValue) && prompt) {
      const selectedApi = await pickApiInteractively(prompt, context.document);
      method = selectedApi.method;
      pathValue = selectedApi.path;
      process.stderr.write(`Selected API: ${method.toUpperCase()} ${pathValue}\n`);
    }

    if (!method) {
      throw new Error("Missing required argument: --method");
    }
    if (!pathValue) {
      throw new Error("Missing required argument: --path");
    }

    const matchedApi = findApiByPathAndMethod(context.document, pathValue, method);
    if (!matchedApi) {
      const candidates = collectApis(context.document).filter((item) => item.path === pathValue);
      const methodTips =
        candidates.length > 0
          ? ` Available methods for this path: ${candidates
              .map((item) => item.method.toUpperCase())
              .join(", ")}`
          : "";
      throw new Error(`API not found: ${method.toUpperCase()} ${pathValue}.${methodTips}`);
    }

    let outputFormat = String(options.format || "").trim().toLowerCase();
    if (!outputFormat && prompt) {
      const selectedFormat = await selectByNumber(
        prompt,
        "Select output format:",
        ["ts", "json"],
        (item) => (item === "ts" ? "TypeScript" : "JSON"),
      );
      outputFormat = selectedFormat;
    }
    if (!outputFormat) outputFormat = "ts";

    const shouldCopy = options.copy
      ? true
      : prompt
      ? await askYesNo(prompt, "Copy generated TypeScript to clipboard", false)
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
        throw new Error(
          "Failed to copy output to clipboard (pbcopy/wl-copy/xclip/xsel not available)",
        );
      }
      process.stderr.write("Copied generated TypeScript to clipboard.\n");
    }
  } finally {
    prompt?.close();
  }
}

async function main() {
  const { command, options } = parseArgv(process.argv.slice(2));

  if (!command || options.help) {
    printHelp();
    return;
  }

  const { config } = await loadUserConfig(process.cwd());
  const settings = resolveSettings(options, config);
  const needsHost =
    command === "services" ||
    (command === "search" && !options["doc-url"]) ||
    (command === "gen" &&
      !options["doc-url"] &&
      !isInteractiveAllowed(options));

  if (!settings.host && needsHost) {
    throw new Error(
      "Host is required. Provide --host, set TS_SWAGGER_HOST, or configure host in ts-swagger.config.json.",
    );
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

  throw new Error(`Unknown command "${command}"`);
}

main().catch((error) => {
  process.stderr.write(`[ts-swagger] ${error.message}\n`);
  process.exit(1);
});
