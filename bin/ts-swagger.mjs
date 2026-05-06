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
  findService,
  loadOpenApiDocumentByService,
  loadOpenApiDocumentFromUrl,
  loadSwaggerConfig,
  normalizeBaseUrl,
} from "../src/core/swagger-loader.js";

const DEFAULT_CONFIG = {
  host: "https://swagger.huzhibin.top",
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

function printHelp() {
  process.stdout.write(`ts-swagger CLI

Usage:
  ts-swagger services [--host <url>] [--version <v3>] [--format <text|json>]
  ts-swagger search --keyword <text> [--service <name>] [--host <url>] [--doc-url <url>] [--format <text|json>]
  ts-swagger gen --method <method> --path <api-path> [--service <name>] [--host <url>] [--doc-url <url>] [--copy] [--format <ts|json>]

Notes:
  - host priority: --host > ts-swagger.config.json > ${DEFAULT_CONFIG.host}
  - service is selected interactively when omitted and swagger-config contains multiple services
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
      : normalizeBaseUrl(userConfig.host || DEFAULT_CONFIG.host);
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

function printServiceList(services) {
  services.forEach((item, index) => {
    process.stderr.write(`${index + 1}. ${item.name} -> ${item.url}\n`);
  });
}

async function selectServiceInteractively(services) {
  process.stderr.write("Detected multiple services. Select one:\n");
  printServiceList(services);

  const rl = readline.createInterface({ input, output: process.stderr });
  try {
    while (true) {
      const answer = await rl.question("Enter service number: ");
      const index = Number.parseInt(String(answer).trim(), 10);
      if (Number.isNaN(index) || index < 1 || index > services.length) {
        process.stderr.write("Invalid number, try again.\n");
        continue;
      }
      return services[index - 1];
    }
  } finally {
    rl.close();
  }
}

async function resolveServiceDocument({
  options,
  host,
  version,
  timeoutMs,
}) {
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

  const config = await loadSwaggerConfig(host, version, timeoutMs);
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
  } else if (process.stdin.isTTY && process.stderr.isTTY) {
    selectedService = await selectServiceInteractively(services);
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
  const method = ensureMethod(options.method);
  const pathValue = String(options.path || "").trim();
  if (!pathValue) {
    throw new Error("Missing required argument: --path");
  }

  const context = await resolveServiceDocument({
    options,
    host: settings.host,
    version: settings.version,
    timeoutMs: settings.timeoutMs,
  });

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

  const parser = new SwaggerToTS(context.document, settings.generator);
  const generated = parser.getStructuredTypes(pathValue, method);
  const tsOutput = formatTsOutput(generated);
  const outputFormat = String(options.format || "ts").toLowerCase();

  if (outputFormat === "json") {
    process.stdout.write(
      `${JSON.stringify(
        {
          host: settings.host,
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

  if (options.copy) {
    const copied = copyToClipboard(tsOutput);
    if (!copied) {
      throw new Error(
        "Failed to copy output to clipboard (pbcopy/wl-copy/xclip/xsel not available)",
      );
    }
    process.stderr.write("Copied generated TypeScript to clipboard.\n");
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

  if (!settings.host && command !== "gen" && !options["doc-url"]) {
    throw new Error("Host is empty. Configure host in ts-swagger.config.json or pass --host.");
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
