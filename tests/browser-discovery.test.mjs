import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import http from "node:http";
import test from "node:test";
import { discoverOpenApiFromBrowser } from "../dist/core/browser-openapi-discovery.js";

const chromeCandidates = [
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
