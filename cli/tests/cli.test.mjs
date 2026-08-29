import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repositoryRoot, "dist/cli/apitypegen.js");
const binPath = path.join(repositoryRoot, "bin/apitypegen.mjs");
const emptyCwd = mkdtempSync(path.join(tmpdir(), "apitypegen-cli-test-"));
const cacheRoot = mkdtempSync(path.join(tmpdir(), "apitypegen-cli-cache-test-"));

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: emptyCwd,
    encoding: "utf8",
    env: {
      ...process.env,
      APITYPEGEN_TYPE: "",
      APITYPEGEN_URL: "",
      TS_SWAGGER_TYPE: "",
      TS_SWAGGER_URL: "",
      TS_SWAGGER_HOST: "",
      XDG_CACHE_HOME: cacheRoot,
    },
  });
}

function runCliAsync(args, overrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: overrides.cwd || emptyCwd,
      env: {
        ...process.env,
        APITYPEGEN_TYPE: "",
        APITYPEGEN_URL: "",
        TS_SWAGGER_TYPE: "",
        TS_SWAGGER_URL: "",
        TS_SWAGGER_HOST: "",
        XDG_CACHE_HOME: cacheRoot,
        ...(overrides.env || {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("帮助信息只展示 type/url 三种来源", () => {
  const result = runCli(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /apitypegen inspect --url <url>/);
  assert.match(result.stdout, /--type <page\|openapi\|swagger-config>/);
  assert.match(result.stdout, /不写命令时默认执行 gen/);
  assert.doesNotMatch(result.stdout, /apitypegen services/);
  assert.doesNotMatch(result.stdout, /--host/);
  assert.doesNotMatch(result.stdout, /--doc-url/);
});

test("inspect 命令识别来源并返回稳定 JSON 协议", async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Inspect Service" },
        paths: {},
      }),
    );
  });

  try {
    const address = await listen(server);
    const result = await runCliAsync([
      "inspect",
      "--url",
      `http://127.0.0.1:${address.port}/provided-url`,
      "--no-interactive",
      "--format",
      "json",
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const output = JSON.parse(result.stdout);
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.command, "inspect");
    assert.equal(output.data.source.type, "openapi");
    assert.deepEqual(requests, ["/provided-url"]);
  } finally {
    await close(server);
  }
});

test("npm bin 入口可以正常启动 CLI", () => {
  const result = spawnSync(process.execPath, [binPath, "--help"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /APITypeGen 命令行工具/);
});

test("--version 输出当前 CLI 包版本", () => {
  const result = runCli(["--version"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), /^0\.8\.2$/);
  assert.equal(result.stderr, "");
});

test("旧 host 参数返回迁移提示", () => {
  const result = runCli(["gen", "--host", "http://localhost:9999"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /参数 --host 已删除/);
  assert.match(result.stderr, /--type swagger-config --url/);
});

test("host 不再是合法来源类型", () => {
  const result = runCli([
    "gen",
    "--type",
    "host",
    "--url",
    "http://localhost:9999",
    "--no-interactive",
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /无效的 --type "host"/);
});

test("旧 ui 来源类型已替换为 page", () => {
  const result = runCli([
    "gen",
    "--type",
    "ui",
    "--url",
    "http://localhost:9999/doc.html",
    "--no-interactive",
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /无效的 --type "ui"/);
  assert.match(result.stderr, /page, openapi, swagger-config/);
});

test("旧 config 来源类型已替换为 swagger-config", () => {
  const result = runCli([
    "gen",
    "--type",
    "config",
    "--url",
    "http://localhost:9999/swagger-config",
    "--no-interactive",
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /无效的 --type "config"/);
  assert.match(result.stderr, /page, openapi, swagger-config/);
});

test("非交互模式要求 type 和 url 成对提供", () => {
  const result = runCli(["gen", "--type", "swagger-config", "--no-interactive"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--type 和 --url 必须同时提供/);
});

test("未知参数不会被静默忽略", () => {
  const result = runCli(["gen", "--unknown", "value"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /不支持参数 --unknown/);
});

test("services 命令已移除", () => {
  const result = runCli(["services"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /命令 services 已删除/);
});

test("省略命令时默认执行 gen", () => {
  const result = runCli(["--no-interactive"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /缺少来源/);
  assert.doesNotMatch(result.stdout, /APITypeGen 命令行工具/);
});

test("JSON 模式使用版本化失败协议", () => {
  const result = runCli(["--no-interactive", "--format", "json"]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout);
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.ok, false);
  assert.equal(output.command, "gen");
  assert.equal(output.error.code, "INVALID_ARGUMENT");
  assert.match(output.error.message, /缺少来源/);
});

test("JSON 模式为已删除命令返回稳定错误码", () => {
  const result = runCli(["services", "--format", "json"]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout);
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.ok, false);
  assert.equal(output.command, "services");
  assert.equal(output.error.code, "INVALID_COMMAND");
});

test("多服务默认全部加载，--service 仅作为过滤器", async () => {
  const requests = [];
  let baseUrl = "";
  const documents = {
    "/service-a": {
      openapi: "3.0.0",
      info: { title: "Service A" },
      paths: {
        "/users": {
          get: {
            summary: "shared-search users",
            responses: { 200: { description: "ok" } },
          },
        },
        "/health": {
          get: { summary: "health a", responses: { 200: { description: "ok" } } },
        },
      },
    },
    "/service-b": {
      openapi: "3.0.0",
      info: { title: "Service B" },
      paths: {
        "/orders": {
          post: {
            summary: "shared-search orders",
            responses: {
              200: {
                description: "ok",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { id: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
        "/health": {
          get: { summary: "health b", responses: { 200: { description: "ok" } } },
        },
      },
    },
  };
  const server = http.createServer((request, response) => {
    const requestUrl = request.url || "";
    requests.push(requestUrl);
    response.setHeader("content-type", "application/json");
    if (requestUrl === "/config" || requestUrl.startsWith("/config?")) {
      response.end(
        JSON.stringify({
          urls: [
            { name: "service-a", url: `${baseUrl}/service-a` },
            { name: "service-b", url: `${baseUrl}/service-b` },
          ],
        }),
      );
      return;
    }
    if (requestUrl === "/partial-config") {
      response.end(
        JSON.stringify({
          urls: [
            { name: "service-a", url: `${baseUrl}/service-a` },
            { name: "unavailable-service", url: `${baseUrl}/unavailable` },
          ],
        }),
      );
      return;
    }
    if (requestUrl === "/failed-config") {
      response.end(
        JSON.stringify({
          urls: [{ name: "unavailable-service", url: `${baseUrl}/unavailable` }],
        }),
      );
      return;
    }
    if (requestUrl === "/invalid-openapi") {
      response.end(JSON.stringify({ paths: {} }));
      return;
    }
    if (requestUrl === "/unavailable") {
      response.statusCode = 503;
      response.end(JSON.stringify({ message: "temporarily unavailable" }));
      return;
    }
    const document = documents[requestUrl];
    if (document) {
      response.end(JSON.stringify(document));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ message: "not found" }));
  });

  try {
    const address = await listen(server);
    baseUrl = `http://127.0.0.1:${address.port}`;
    const commonArgs = [
      "--type",
      "swagger-config",
      "--url",
      `${baseUrl}/config`,
      "--no-interactive",
    ];

    const searchResult = await runCliAsync([
      "search",
      ...commonArgs,
      "--keyword",
      "shared-search",
      "--format",
      "json",
    ]);
    assert.equal(searchResult.status, 0, searchResult.stderr);
    assert.match(searchResult.stderr, /正在加载 2 个服务/);
    const searchOutput = JSON.parse(searchResult.stdout);
    assert.equal(searchOutput.schemaVersion, 1);
    assert.equal(searchOutput.ok, true);
    assert.equal(searchOutput.command, "search");
    assert.deepEqual(searchOutput.warnings, []);
    assert.equal(searchOutput.data.total, 2);
    assert.equal(searchOutput.data.returned, 2);
    assert.equal(searchOutput.data.limit, 20);
    assert.deepEqual(
      searchOutput.data.items.map((item) => item.service),
      ["service-a", "service-b"],
    );
    assert.deepEqual(searchOutput.data.items[0].selector, {
      service: "service-a",
      method: "get",
      path: "/users",
    });

    requests.length = 0;
    const limitedSearchResult = await runCliAsync([
      "search",
      ...commonArgs,
      "--keyword",
      "shared-search",
      "--limit",
      "1",
      "--format",
      "json",
    ]);
    assert.equal(limitedSearchResult.status, 0, limitedSearchResult.stderr);
    const limitedSearchOutput = JSON.parse(limitedSearchResult.stdout);
    assert.equal(limitedSearchOutput.data.total, 2);
    assert.equal(limitedSearchOutput.data.returned, 1);
    assert.equal(limitedSearchOutput.data.items.length, 1);
    assert.ok(requests.includes("/config"));
    assert.ok(!requests.includes("/service-a"));
    assert.ok(!requests.includes("/service-b"));

    const invalidLimitResult = await runCliAsync([
      "search",
      ...commonArgs,
      "--keyword",
      "shared-search",
      "--limit",
      "0",
      "--format",
      "json",
    ]);
    assert.equal(invalidLimitResult.status, 1);
    const invalidLimitOutput = JSON.parse(invalidLimitResult.stdout);
    assert.equal(invalidLimitOutput.error.code, "INVALID_ARGUMENT");
    assert.equal(invalidLimitOutput.error.details.option, "limit");

    const invalidOpenApiResult = await runCliAsync([
      "gen",
      "--type",
      "openapi",
      "--url",
      `${baseUrl}/invalid-openapi`,
      "--method",
      "get",
      "--path",
      "/health",
      "--no-interactive",
      "--format",
      "json",
    ]);
    assert.equal(invalidOpenApiResult.status, 1);
    const invalidOpenApiOutput = JSON.parse(invalidOpenApiResult.stdout);
    assert.equal(invalidOpenApiOutput.error.code, "OPENAPI_INVALID");

    const directOpenApiSearchResult = await runCliAsync([
      "search",
      "--type",
      "openapi",
      "--url",
      `${baseUrl}/service-a`,
      "--keyword",
      "users",
      "--no-interactive",
      "--format",
      "text",
    ]);
    assert.equal(directOpenApiSearchResult.status, 0, directOpenApiSearchResult.stderr);
    assert.match(directOpenApiSearchResult.stdout, /关键词: users/);
    assert.match(directOpenApiSearchResult.stdout, /\[Service A\] GET \/users/);

    const directOpenApiGenResult = await runCliAsync([
      "gen",
      "--type",
      "openapi",
      "--url",
      `${baseUrl}/service-a`,
      "--method",
      "get",
      "--path",
      "/users",
      "--no-interactive",
      "--format",
      "ts",
    ]);
    assert.equal(directOpenApiGenResult.status, 0, directOpenApiGenResult.stderr);
    assert.match(directOpenApiGenResult.stdout, /\/\/ 模型定义/);
    assert.doesNotMatch(directOpenApiGenResult.stdout, /"schemaVersion"/);

    const configCwd = mkdtempSync(path.join(tmpdir(), "apitypegen-config-source-test-"));
    writeFileSync(
      path.join(configCwd, "apitypegen.config.json"),
      JSON.stringify({ source: { type: "openapi", url: `${baseUrl}/service-a` } }),
    );
    const configSourceResult = await runCliAsync(
      ["search", "--keyword", "users", "--no-interactive", "--format", "json"],
      { cwd: configCwd },
    );
    assert.equal(configSourceResult.status, 0, configSourceResult.stderr);
    assert.equal(JSON.parse(configSourceResult.stdout).data.items[0].service, "Service A");

    const legacyConfigCwd = mkdtempSync(path.join(tmpdir(), "apitypegen-legacy-config-test-"));
    writeFileSync(
      path.join(legacyConfigCwd, "ts-swagger.config.json"),
      JSON.stringify({ source: { type: "openapi", url: `${baseUrl}/service-a` } }),
    );
    const legacyConfigResult = await runCliAsync(
      ["search", "--keyword", "users", "--no-interactive", "--format", "json"],
      { cwd: legacyConfigCwd },
    );
    assert.equal(legacyConfigResult.status, 0, legacyConfigResult.stderr);
    assert.equal(JSON.parse(legacyConfigResult.stdout).data.items[0].service, "Service A");

    const environmentSourceResult = await runCliAsync(
      ["search", "--keyword", "orders", "--no-interactive", "--format", "json"],
      {
        env: {
          APITYPEGEN_TYPE: "openapi",
          APITYPEGEN_URL: `${baseUrl}/service-b`,
        },
      },
    );
    assert.equal(environmentSourceResult.status, 0, environmentSourceResult.stderr);
    assert.equal(
      JSON.parse(environmentSourceResult.stdout).data.items[0].service,
      "Service B",
    );

    const cliSourcePriorityResult = await runCliAsync(
      [
        "search",
        "--type",
        "openapi",
        "--url",
        `${baseUrl}/service-a`,
        "--keyword",
        "users",
        "--no-interactive",
        "--format",
        "json",
      ],
      {
        env: {
          TS_SWAGGER_TYPE: "openapi",
          TS_SWAGGER_URL: `${baseUrl}/service-b`,
        },
      },
    );
    assert.equal(cliSourcePriorityResult.status, 0, cliSourcePriorityResult.stderr);
    assert.equal(
      JSON.parse(cliSourcePriorityResult.stdout).data.items[0].service,
      "Service A",
    );

    const partialArgs = [
      "--type",
      "swagger-config",
      "--url",
      `${baseUrl}/partial-config`,
      "--no-interactive",
    ];
    const partialSearchResult = await runCliAsync([
      "search",
      ...partialArgs,
      "--keyword",
      "shared-search",
      "--format",
      "json",
    ]);
    assert.equal(partialSearchResult.status, 0, partialSearchResult.stderr);
    const partialSearchOutput = JSON.parse(partialSearchResult.stdout);
    assert.equal(partialSearchOutput.ok, true);
    assert.equal(partialSearchOutput.data.total, 1);
    assert.equal(partialSearchOutput.data.loadedServices, 1);
    assert.equal(partialSearchOutput.data.failedServices.length, 1);
    assert.equal(partialSearchOutput.data.failedServices[0].service, "unavailable-service");
    assert.equal(partialSearchOutput.warnings[0].code, "SERVICE_LOAD_FAILED");

    const incompleteGenResult = await runCliAsync([
      "gen",
      ...partialArgs,
      "--method",
      "get",
      "--path",
      "/users",
      "--format",
      "json",
    ]);
    assert.equal(incompleteGenResult.status, 1);
    const incompleteGenOutput = JSON.parse(incompleteGenResult.stdout);
    assert.equal(incompleteGenOutput.error.code, "INCOMPLETE_SERVICE_LOAD");
    assert.equal(incompleteGenOutput.error.details.failures.length, 1);
    assert.equal(incompleteGenOutput.error.recovery.action, "retry");
    assert.equal(incompleteGenOutput.error.recovery.commands.length, 1);
    assert.ok(incompleteGenOutput.error.recovery.commands[0].args.includes("service-a"));

    requests.length = 0;
    const targetedGenResult = await runCliAsync([
      "gen",
      ...partialArgs,
      "--service",
      "service-a",
      "--refresh",
      "--method",
      "get",
      "--path",
      "/users",
      "--format",
      "json",
    ]);
    assert.equal(targetedGenResult.status, 0, targetedGenResult.stderr);
    assert.equal(JSON.parse(targetedGenResult.stdout).data.service, "service-a");
    assert.ok(requests.includes("/service-a"));
    assert.ok(!requests.includes("/unavailable"));

    const allFailedSearchResult = await runCliAsync([
      "search",
      "--type",
      "swagger-config",
      "--url",
      `${baseUrl}/failed-config`,
      "--keyword",
      "order",
      "--no-interactive",
      "--format",
      "json",
    ]);
    assert.equal(allFailedSearchResult.status, 1);
    const allFailedSearchOutput = JSON.parse(allFailedSearchResult.stdout);
    assert.equal(allFailedSearchOutput.error.code, "SERVICE_LOAD_FAILED");
    assert.equal(allFailedSearchOutput.error.details.failures.length, 1);

    const genResult = await runCliAsync([
      ...commonArgs,
      "--method",
      "post",
      "--path",
      "/orders",
      "--format",
      "json",
    ]);
    assert.equal(genResult.status, 0, genResult.stderr);
    const genOutput = JSON.parse(genResult.stdout);
    assert.equal(genOutput.schemaVersion, 1);
    assert.equal(genOutput.ok, true);
    assert.equal(genOutput.command, "gen");
    assert.equal(genOutput.data.service, "service-b");
    assert.deepEqual(genOutput.data.selector, {
      service: "service-b",
      method: "post",
      path: "/orders",
    });

    const ambiguousResult = await runCliAsync([
      "gen",
      ...commonArgs,
      "--method",
      "get",
      "--path",
      "/health",
      "--format",
      "json",
    ]);
    assert.equal(ambiguousResult.status, 1);
    const ambiguousOutput = JSON.parse(ambiguousResult.stdout);
    assert.equal(ambiguousOutput.ok, false);
    assert.equal(ambiguousOutput.error.code, "AMBIGUOUS_API");
    assert.equal(ambiguousOutput.error.details.candidates.length, 2);
    assert.equal(ambiguousOutput.error.recovery.action, "retry");
    assert.equal(ambiguousOutput.error.recovery.commands.length, 2);
    assert.deepEqual(
      ambiguousOutput.error.recovery.candidates.map((item) => item.selector.service),
      ["service-a", "service-b"],
    );
    assert.ok(ambiguousOutput.error.recovery.commands[0].args.includes("--service"));
    assert.match(ambiguousOutput.error.message, /--service <name>/);

    const notFoundResult = await runCliAsync([
      "gen",
      ...commonArgs,
      "--method",
      "get",
      "--path",
      "/user",
      "--format",
      "json",
    ]);
    assert.equal(notFoundResult.status, 1);
    const notFoundOutput = JSON.parse(notFoundResult.stdout);
    assert.equal(notFoundOutput.error.code, "API_NOT_FOUND");
    assert.equal(notFoundOutput.error.recovery.action, "select");
    assert.deepEqual(notFoundOutput.error.recovery.candidates[0].selector, {
      service: "service-a",
      method: "get",
      path: "/users",
    });
    assert.ok(notFoundOutput.error.recovery.candidates.length <= 5);

    const redactedRecoveryResult = await runCliAsync([
      "gen",
      "--type",
      "swagger-config",
      "--url",
      `${baseUrl}/config?access_token=secret-value`,
      "--method",
      "get",
      "--path",
      "/health",
      "--no-interactive",
      "--format",
      "json",
    ]);
    assert.equal(redactedRecoveryResult.status, 1);
    const redactedRecoveryOutput = JSON.parse(redactedRecoveryResult.stdout);
    assert.equal(redactedRecoveryOutput.error.code, "AMBIGUOUS_API");
    assert.ok(
      redactedRecoveryOutput.error.recovery.commands.every((item) =>
        item.args.includes("<source-url>"),
      ),
    );
    assert.doesNotMatch(redactedRecoveryResult.stdout, /secret-value/);

    const textRecoveryResult = await runCliAsync([
      "gen",
      ...commonArgs,
      "--method",
      "get",
      "--path",
      "/health",
      "--no-interactive",
    ]);
    assert.equal(textRecoveryResult.status, 1);
    assert.equal(textRecoveryResult.stdout, "");
    assert.match(textRecoveryResult.stderr, /修复建议/);
    assert.match(textRecoveryResult.stderr, /apitypegen gen .*--service service-a/);

    requests.length = 0;
    const filteredResult = await runCliAsync([
      "search",
      ...commonArgs,
      "--keyword",
      "shared-search",
      "--service",
      "service-a",
      "--refresh",
      "--format",
      "json",
    ]);
    assert.equal(filteredResult.status, 0, filteredResult.stderr);
    assert.equal(JSON.parse(filteredResult.stdout).data.total, 1);
    assert.ok(requests.includes("/service-a"));
    assert.ok(!requests.includes("/service-b"));
  } finally {
    await close(server);
  }
});
