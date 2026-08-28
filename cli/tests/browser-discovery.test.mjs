import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { discoverOpenApiFromBrowser } from "../dist/core/browser-openapi-discovery.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repositoryRoot, "dist/cli/apitypegen.js");

const chromeCandidates = [
  process.env.APITYPEGEN_CHROME_PATH,
  process.env.TS_SWAGGER_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("测试服务器没有获得 TCP 地址"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function runCliAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: mkdtempSync(path.join(tmpdir(), "apitypegen-ui-cli-test-")),
      env: {
        ...process.env,
        APITYPEGEN_TYPE: "",
        APITYPEGEN_URL: "",
        TS_SWAGGER_TYPE: "",
        TS_SWAGGER_URL: "",
        XDG_CACHE_HOME: mkdtempSync(path.join(tmpdir(), "apitypegen-ui-cache-test-")),
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

test(
  "从 Swagger UI 页面真实 GET 响应捕获 swagger-config",
  { skip: chromePath ? false : "未检测到系统 Chrome" },
  async () => {
    let postCount = 0;
    const server = http.createServer((request, response) => {
      if (request.method === "POST") postCount += 1;
      if (request.url === "/doc.html") {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(`<!doctype html><script>
          fetch('/mutation', { method: 'POST' }).catch(() => {});
          fetch('/runtime-config').then((response) => response.json());
        </script>`);
        return;
      }
      if (request.url === "/runtime-config") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({
          urls: [{ name: "订单服务", url: "/order/v3/api-docs" }]
        }));
        return;
      }
      response.statusCode = 404;
      response.end("not found");
    });
    const baseUrl = await listen(server);

    try {
      const result = await discoverOpenApiFromBrowser(`${baseUrl}/doc.html#/home`, {
        timeoutMs: 5000,
        chromePath,
      });

      assert.equal(result.kind, "swagger-config");
      assert.deepEqual(result.config.urls, [
        { name: "订单服务", url: `${baseUrl}/order/v3/api-docs` },
      ]);
      assert.equal(postCount, 0);
    } finally {
      await close(server);
    }
  },
);

test(
  "页面没有真实文档响应时直接报错且不猜测路径",
  { skip: chromePath ? false : "未检测到系统 Chrome" },
  async () => {
    const requestedPaths = [];
    const server = http.createServer((request, response) => {
      requestedPaths.push(request.url || "");
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<!doctype html><title>empty</title>");
    });
    const baseUrl = await listen(server);

    try {
      await assert.rejects(
        discoverOpenApiFromBrowser(`${baseUrl}/doc.html#/home`, {
          timeoutMs: 3000,
          chromePath,
        }),
        /未捕获到有效的 OpenAPI 或 swagger-config GET 响应/,
      );
      assert.deepEqual(requestedPaths, ["/doc.html"]);
    } finally {
      await close(server);
    }
  },
);

test(
  "CLI page 来源通过 Presenter 输出稳定搜索 JSON",
  { skip: chromePath ? false : "未检测到系统 Chrome" },
  async () => {
    const server = http.createServer((request, response) => {
      if (request.url === "/doc.html") {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(`<!doctype html><script>
          fetch('/runtime-config').then((response) => response.json());
        </script>`);
        return;
      }
      if (request.url === "/runtime-config") {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            urls: [{ name: "ui-service", url: "/openapi" }],
          }),
        );
        return;
      }
      if (request.url === "/openapi") {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            openapi: "3.0.0",
            info: { title: "UI Service" },
            paths: {
              "/ui/orders": {
                get: {
                  summary: "ui-search orders",
                  responses: { 200: { description: "ok" } },
                },
              },
            },
          }),
        );
        return;
      }
      response.statusCode = 404;
      response.end("not found");
    });
    const baseUrl = await listen(server);

    try {
      const result = await runCliAsync([
        "search",
        "--type",
        "page",
        "--url",
        `${baseUrl}/doc.html#/home`,
        "--keyword",
        "ui-search",
        "--chrome-path",
        chromePath,
        "--no-interactive",
        "--format",
        "json",
      ]);

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /正在通过系统 Chrome 读取页面网络响应/);
      const output = JSON.parse(result.stdout);
      assert.equal(output.schemaVersion, 1);
      assert.equal(output.ok, true);
      assert.equal(output.command, "search");
      assert.equal(output.data.total, 1);
      assert.deepEqual(output.data.items[0].selector, {
        service: "ui-service",
        method: "get",
        path: "/ui/orders",
      });
    } finally {
      await close(server);
    }
  },
);
