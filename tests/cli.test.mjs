import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repositoryRoot, "dist/cli/ts-swagger.js");
const emptyCwd = mkdtempSync(path.join(tmpdir(), "ts-swagger-cli-test-"));

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: emptyCwd,
    encoding: "utf8",
    env: {
      ...process.env,
      TS_SWAGGER_TYPE: "",
      TS_SWAGGER_URL: "",
      TS_SWAGGER_HOST: "",
    },
  });
}

function runCliAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: emptyCwd,
      env: {
        ...process.env,
        TS_SWAGGER_TYPE: "",
        TS_SWAGGER_URL: "",
        TS_SWAGGER_HOST: "",
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
  assert.match(result.stdout, /--type <ui\|openapi\|config>/);
  assert.match(result.stdout, /不写命令时默认执行 gen/);
  assert.doesNotMatch(result.stdout, /ts-swagger services/);
  assert.doesNotMatch(result.stdout, /--host/);
  assert.doesNotMatch(result.stdout, /--doc-url/);
});

test("旧 host 参数返回迁移提示", () => {
  const result = runCli(["gen", "--host", "http://localhost:9999"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /参数 --host 已删除/);
  assert.match(result.stderr, /--type config --url/);
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

test("非交互模式要求 type 和 url 成对提供", () => {
  const result = runCli(["gen", "--type", "config", "--no-interactive"]);

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
  assert.doesNotMatch(result.stdout, /ts-swagger 命令行工具/);
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
    if (requestUrl === "/config") {
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
    const commonArgs = ["--type", "config", "--url", `${baseUrl}/config`, "--no-interactive"];

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
    assert.equal(searchOutput.count, 2);
    assert.deepEqual(
      searchOutput.items.map((item) => item.service),
      ["service-a", "service-b"],
    );

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
    assert.equal(JSON.parse(genResult.stdout).service, "service-b");

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
    assert.match(ambiguousResult.stderr, /多个服务中存在 API GET \/health/);
    assert.match(ambiguousResult.stderr, /--service <name>/);

    requests.length = 0;
    const filteredResult = await runCliAsync([
      "search",
      ...commonArgs,
      "--keyword",
      "shared-search",
      "--service",
      "service-a",
      "--format",
      "json",
    ]);
    assert.equal(filteredResult.status, 0, filteredResult.stderr);
    assert.equal(JSON.parse(filteredResult.stdout).count, 1);
    assert.ok(requests.includes("/service-a"));
    assert.ok(!requests.includes("/service-b"));
  } finally {
    await close(server);
  }
});
