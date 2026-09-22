import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(cliRoot, "dist/cli/apitypegen.js");
const packageVersion = JSON.parse(
  readFileSync(path.join(cliRoot, "package.json"), "utf8"),
).version;

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

test("MCP stdio 暴露识别、搜索和生成工具并返回结构化结果", async () => {
  const document = {
    openapi: "3.0.0",
    info: { title: "Order Service" },
    paths: {
      "/orders/{id}": {
        get: {
          summary: "查询订单详情",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
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
    },
  };
  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(document));
  });

  let client;
  let transport;
  try {
    const address = await listen(server);
    const documentUrl = `http://127.0.0.1:${address.port}/openapi`;
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [cliPath, "mcp"],
      cwd: cliRoot,
      stderr: "pipe",
    });
    client = new Client({ name: "apitypegen-test", version: "1.0.0" });
    await client.connect(transport);

    assert.equal(client.getServerVersion()?.version, packageVersion);
    assert.match(client.getInstructions(), /先调用 resolve_source/);
    assert.match(client.getInstructions(), /不要猜测、拼接或探测/);

    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ["generate_typescript", "inspect_source", "resolve_source", "search_apis"],
    );
    assert.ok(tools.tools.every((tool) => tool.outputSchema));
    assert.ok(
      tools.tools
        .find((tool) => tool.name === "generate_typescript")
        .outputSchema.properties.error,
    );
    assert.deepEqual(
      tools.tools.find((tool) => tool.name === "search_apis")
        .inputSchema.properties.source.properties.type.enum,
      ["page", "openapi", "swagger-config"],
    );

    const inspectResult = await client.callTool({
      name: "inspect_source",
      arguments: { url: documentUrl },
    });
    assert.equal(inspectResult.isError, undefined);
    assert.equal(inspectResult.structuredContent.schemaVersion, 1);
    assert.equal(inspectResult.structuredContent.command, "inspect_source");
    assert.equal(inspectResult.structuredContent.data.source.type, "openapi");

    const searchResult = await client.callTool({
      name: "search_apis",
      arguments: {
        source: { type: "openapi", url: documentUrl },
        keyword: "请帮我查询订单详情接口",
      },
    });
    assert.equal(searchResult.isError, undefined);
    assert.equal(searchResult.structuredContent.schemaVersion, 1);
    assert.equal(searchResult.structuredContent.command, "search_apis");
    assert.equal(searchResult.structuredContent.ok, true);
    assert.equal(searchResult.structuredContent.data.items.length, 1);
    assert.deepEqual(searchResult.structuredContent.data.items[0].selector, {
      service: "Order Service",
      method: "get",
      path: "/orders/{id}",
    });

    const generateResult = await client.callTool({
      name: "generate_typescript",
      arguments: {
        source: { type: "openapi", url: documentUrl },
        method: "get",
        path: "/orders/{id}",
        confirmed: true,
      },
    });
    assert.equal(generateResult.isError, undefined);
    assert.equal(generateResult.structuredContent.schemaVersion, 1);
    assert.equal(generateResult.structuredContent.command, "generate_typescript");
    assert.equal(generateResult.structuredContent.ok, true);
    assert.match(generateResult.structuredContent.data.code, /响应 200/);
    assert.equal(generateResult.structuredContent.data.selector.path, "/orders/{id}");

    const recoveryResult = await client.callTool({
      name: "generate_typescript",
      arguments: {
        source: { type: "openapi", url: documentUrl },
        method: "post",
        path: "/orders/{id}",
        confirmed: true,
      },
    });
    assert.equal(recoveryResult.isError, true);
    assert.equal(recoveryResult.structuredContent.error.code, "API_NOT_FOUND");
    assert.equal(
      recoveryResult.structuredContent.error.recovery.action,
      "select_tool_call",
    );
    assert.equal(
      recoveryResult.structuredContent.error.recovery.candidates[0].tool,
      "generate_typescript",
    );
    assert.equal(
      recoveryResult.structuredContent.error.recovery.candidates[0].arguments.method,
      "get",
    );
  } finally {
    await client?.close();
    await transport?.close();
    await close(server);
  }
});

test("MCP 多服务搜索共用同一文档请求并保留服务选择器", async (t) => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "apitypegen-mcp-shared-openapi-"));
  const previousCacheRoot = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = cacheRoot;
  const configUrl = "https://example.test/swagger-config";
  const documentUrl = "https://example.test/shared-openapi";
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(String(url));
    const body = String(url) === configUrl
      ? {
          urls: [
            { name: "订单服务 A", url: documentUrl },
            { name: "订单服务 B", url: documentUrl },
          ],
        }
      : {
          openapi: "3.0.0",
          info: { title: "订单文档" },
          paths: {
            "/orders": {
              get: { summary: "查询订单", responses: { 200: { description: "ok" } } },
            },
          },
        };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  try {
    const { executeSearchApisTool } = await import("../dist/mcp/server.js");
    const result = await executeSearchApisTool({
      source: { type: "swagger-config", url: configUrl },
      keyword: "查询订单",
    });

    assert.equal(result.structuredContent.ok, true);
    assert.deepEqual(requests, [configUrl, documentUrl]);
    assert.equal(result.structuredContent.data.loadedServices, 2);
    assert.deepEqual(
      result.structuredContent.data.items.map((item) => item.selector),
      [
        { service: "订单服务 A", method: "get", path: "/orders" },
        { service: "订单服务 B", method: "get", path: "/orders" },
      ],
    );
  } finally {
    if (previousCacheRoot === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = previousCacheRoot;
    await rm(cacheRoot, { recursive: true, force: true });
  }
});

test("MCP 批量生成共用一次文档请求并返回逐项结果", async (t) => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "apitypegen-mcp-batch-gen-"));
  const previousCacheRoot = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = cacheRoot;
  const documentUrl = "https://example.test/batch-openapi";
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(String(url));
    return new Response(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "批量文档" },
        paths: {
          "/orders": {
            get: { summary: "查询订单", responses: { 200: { description: "ok" } } },
          },
          "/orders/{id}": {
            post: { summary: "创建订单", responses: { 200: { description: "ok" } } },
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    const { executeGenerateTypescriptTool } = await import("../dist/mcp/server.js");
    const result = await executeGenerateTypescriptTool({
      source: { type: "openapi", url: documentUrl },
      selectors: [
        { method: "get", path: "/orders" },
        { method: "post", path: "/orders/{id}" },
      ],
      confirmed: true,
    });

    assert.equal(result.structuredContent.ok, true);
    assert.deepEqual(requests, [documentUrl]);
    const items = result.structuredContent.data.items;
    assert.equal(items.length, 2);
    assert.deepEqual(
      items.map((item) => item.selector),
      [
        { service: "批量文档", method: "get", path: "/orders" },
        { service: "批量文档", method: "post", path: "/orders/{id}" },
      ],
    );
    assert.match(items[0].code, /查询订单|响应 200/);
    assert.equal(result.structuredContent.data.errors, undefined);
  } finally {
    if (previousCacheRoot === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = previousCacheRoot;
    await rm(cacheRoot, { recursive: true, force: true });
  }
});

test("MCP 批量生成单个 selector 失败不拖垮其他结果", async (t) => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "apitypegen-mcp-batch-partial-"));
  const previousCacheRoot = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = cacheRoot;
  const documentUrl = "https://example.test/batch-partial-openapi";
  t.mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "部分失败文档" },
        paths: {
          "/orders": {
            get: { summary: "查询订单", responses: { 200: { description: "ok" } } },
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );

  try {
    const { executeGenerateTypescriptTool } = await import("../dist/mcp/server.js");
    const result = await executeGenerateTypescriptTool({
      source: { type: "openapi", url: documentUrl },
      selectors: [
        { method: "get", path: "/orders" },
        { method: "get", path: "/missing" },
      ],
      confirmed: true,
    });

    assert.equal(result.structuredContent.ok, true);
    const data = result.structuredContent.data;
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].selector.path, "/orders");
    assert.equal(data.errors.length, 1);
    assert.equal(data.errors[0].selector.path, "/missing");
    assert.equal(data.errors[0].code, "API_NOT_FOUND");
  } finally {
    if (previousCacheRoot === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = previousCacheRoot;
    await rm(cacheRoot, { recursive: true, force: true });
  }
});

test("MCP 批量生成全部失败时返回第一个错误", async (t) => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "apitypegen-mcp-batch-all-fail-"));
  const previousCacheRoot = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = cacheRoot;
  const documentUrl = "https://example.test/batch-all-fail-openapi";
  t.mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "全部失败文档" },
        paths: {},
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );

  try {
    const { executeGenerateTypescriptTool } = await import("../dist/mcp/server.js");
    const result = await executeGenerateTypescriptTool({
      source: { type: "openapi", url: documentUrl },
      selectors: [
        { method: "get", path: "/missing-a" },
        { method: "post", path: "/missing-b" },
      ],
      confirmed: true,
    });

    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.ok, false);
    assert.equal(result.structuredContent.error.code, "API_NOT_FOUND");
  } finally {
    if (previousCacheRoot === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = previousCacheRoot;
    await rm(cacheRoot, { recursive: true, force: true });
  }
});

test("MCP 批量生成拒绝混用参数与非法 selectors", async (t) => {
  const documentUrl = "https://example.test/batch-invalid-openapi";
  t.mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify({ openapi: "3.0.0", info: { title: "校验文档" }, paths: {} }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );

  const { executeGenerateTypescriptTool } = await import("../dist/mcp/server.js");
  const mixed = await executeGenerateTypescriptTool({
    source: { type: "openapi", url: documentUrl },
    method: "get",
    path: "/orders",
    selectors: [{ method: "get", path: "/orders" }],
    confirmed: true,
  });
  assert.equal(mixed.structuredContent.ok, false);
  assert.equal(mixed.structuredContent.error.code, "INVALID_ARGUMENT");

  const empty = await executeGenerateTypescriptTool({
    source: { type: "openapi", url: documentUrl },
    selectors: [],
    confirmed: true,
  });
  assert.equal(empty.structuredContent.ok, false);
  assert.equal(empty.structuredContent.error.code, "INVALID_ARGUMENT");

  const badPath = await executeGenerateTypescriptTool({
    source: { type: "openapi", url: documentUrl },
    selectors: [{ method: "get", path: "orders" }],
    confirmed: true,
  });
  assert.equal(badPath.structuredContent.ok, false);
  assert.equal(badPath.structuredContent.error.code, "INVALID_ARGUMENT");

  const unconfirmed = await executeGenerateTypescriptTool({
    source: { type: "openapi", url: documentUrl },
    selectors: [{ method: "get", path: "/orders" }],
  });
  assert.equal(unconfirmed.structuredContent.ok, false);
  assert.equal(unconfirmed.structuredContent.error.code, "CONFIRMATION_REQUIRED");
});

test("MCP 工具把可修复执行错误返回为 isError", async () => {
  const { executeGenerateTypescriptTool } = await import("../dist/mcp/server.js");
  const result = await executeGenerateTypescriptTool({
    source: { type: "openapi", url: "http://127.0.0.1:1/not-available" },
    method: "get",
    path: "/missing",
    confirmed: true,
    timeoutMs: 1000,
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.ok, false);
  assert.equal(typeof result.structuredContent.error.code, "string");
  assert.equal(typeof result.structuredContent.error.message, "string");
});

test("MCP 在生成代码存在 TypeScript 语法错误时返回安全诊断", async () => {
  const document = {
    openapi: "3.0.0",
    info: { title: "Invalid Type Service" },
    paths: {
      "/invalid": {
        get: {
          responses: {
            200: {
              description: "ok",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Bad-Model" },
                },
              },
            },
          },
        },
      },
    },
    components: { schemas: { "Bad-Model": { type: "string" } } },
  };
  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(document));
  });
  const address = await listen(server);

  try {
    const { executeGenerateTypescriptTool } = await import("../dist/mcp/server.js");
    const result = await executeGenerateTypescriptTool({
      source: { type: "openapi", url: `http://127.0.0.1:${address.port}/openapi` },
      method: "get",
      path: "/invalid",
      confirmed: true,
    });

    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, "GENERATED_TYPESCRIPT_INVALID");
    assert.equal(result.structuredContent.error.details.source, "mcp");
    assert.equal(result.structuredContent.error.details.diagnostics[0].code, 1005);
    assert.doesNotMatch(JSON.stringify(result.structuredContent.error.details), /Bad-Model|string/);
  } finally {
    await close(server);
  }
});

test("MCP 生成工具在用户未确认接口时拒绝生成", async () => {
  const { executeGenerateTypescriptTool } = await import("../dist/mcp/server.js");
  const result = await executeGenerateTypescriptTool({
    source: { type: "openapi", url: "http://127.0.0.1:1/not-requested" },
    method: "get",
    path: "/missing",
    confirmed: false,
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, "CONFIRMATION_REQUIRED");
  assert.equal(result.structuredContent.error.recovery.action, "ask_user");
});

test("MCP 工具拒绝非 HTTP 来源且不尝试读取本地文件", async () => {
  const { executeSearchApisTool } = await import("../dist/mcp/server.js");
  const result = await executeSearchApisTool({
    source: { type: "openapi", url: "file:///private/openapi.json" },
    keyword: "user",
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, "INVALID_ARGUMENT");
  assert.match(result.structuredContent.error.message, /http 或 https/);
});

test("MCP 工具拒绝旧 ui 来源类型", async () => {
  const { executeSearchApisTool } = await import("../dist/mcp/server.js");
  const result = await executeSearchApisTool({
    source: { type: "ui", url: "http://localhost:9999/doc.html" },
    keyword: "user",
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, "INVALID_ARGUMENT");
  assert.match(result.structuredContent.error.message, /page, openapi, swagger-config/);
});

test("MCP 工具拒绝旧 config 来源类型", async () => {
  const { executeSearchApisTool } = await import("../dist/mcp/server.js");
  const result = await executeSearchApisTool({
    source: { type: "config", url: "http://localhost:9999/swagger-config" },
    keyword: "user",
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, "INVALID_ARGUMENT");
  assert.match(result.structuredContent.error.message, /page, openapi, swagger-config/);
});

test("resolve_source 在客户端不支持 Elicitation 时返回 ask_user fallback", async () => {
  const { executeResolveSourceTool } = await import("../dist/mcp/server.js");
  const result = await executeResolveSourceTool({});

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.command, "resolve_source");
  assert.equal(result.structuredContent.error.code, "INVALID_ARGUMENT");
  assert.equal(result.structuredContent.error.recovery.action, "ask_user");
});

test("resolve_source 用户取消 Elicitation 时返回 USER_INPUT_CANCELLED", async () => {
  const { executeResolveSourceTool } = await import("../dist/mcp/server.js");
  const fakeServer = {
    server: {
      getClientCapabilities: () => ({ elicitation: { form: {} } }),
      elicitInput: async () => ({ action: "cancel" }),
    },
  };
  const result = await executeResolveSourceTool({}, fakeServer);

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.command, "resolve_source");
  assert.equal(result.structuredContent.error.code, "USER_INPUT_CANCELLED");
  assert.equal(result.structuredContent.error.recovery.action, "stop");
  assert.equal(
    result.structuredContent.error.recovery.message,
    "请提供接口文档完整 URL 后重试，服务端会自动识别来源类型。",
  );
});

test("resolve_source 接受 Elicitation 后返回已确认的 OpenAPI 来源", async () => {
  const { executeResolveSourceTool } = await import("../dist/mcp/server.js");
  const originalFetch = globalThis.fetch;
  const elicitationRequests = [];
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ openapi: "3.0.0", paths: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const fakeServer = {
    server: {
      getClientCapabilities: () => ({ elicitation: { form: {} } }),
      elicitInput: async (request) => {
        elicitationRequests.push(request);
        return {
          action: "accept",
          content: { url: "https://example.test/openapi.json" },
        };
      },
    },
  };

  try {
    const result = await executeResolveSourceTool({}, fakeServer);
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.ok, true);
    assert.deepEqual(result.structuredContent.data.source, {
      type: "openapi",
      url: "https://example.test/openapi.json",
    });
    assert.equal(elicitationRequests.length, 1);
    assert.equal(elicitationRequests[0].mode, "form");
    assert.deepEqual(elicitationRequests[0].requestedSchema.required, ["url"]);
    assert.match(
      elicitationRequests[0].requestedSchema.properties.url.description,
      /自动识别文档类型/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolve_source 根据实际响应自动识别 page 来源", async () => {
  const { executeResolveSourceTool } = await import("../dist/mcp/server.js");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("<!doctype html><html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });

  const fakeServer = {
    server: {
      getClientCapabilities: () => ({ elicitation: { form: {} } }),
      elicitInput: async () => ({
        action: "accept",
        content: { url: "https://example.test/swagger-ui/" },
      }),
    },
  };

  try {
    const result = await executeResolveSourceTool({}, fakeServer);
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.ok, true);
    assert.deepEqual(result.structuredContent.data.source, {
      type: "page",
      url: "https://example.test/swagger-ui/",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("search_apis 将误作 OpenAPI 的 HTML 响应归类为来源类型错误", async () => {
  const { executeSearchApisTool } = await import("../dist/mcp/server.js");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("\n<!DOCTYPE html><html></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });

  try {
    const result = await executeSearchApisTool({
      source: { type: "openapi", url: "https://example.test/swagger-ui/" },
      keyword: "登录",
      refresh: true,
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, "SOURCE_TYPE_UNKNOWN");
    assert.equal(result.structuredContent.error.recovery.action, "ask_user");
    assert.match(result.structuredContent.error.message, /返回 HTML 文档页面/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("search_apis 遇到 HTML 来源类型错误时触发 Elicitation 并自动重试", async () => {
  const { createApiTypeGenMcpServer } = await import("../dist/mcp/server.js");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/openapi.json")) {
      return new Response(
        JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Auth Service" },
          paths: {
            "/login": {
              post: {
                summary: "用户登录",
                responses: { 200: { description: "ok" } },
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("<!doctype html><html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "apitypegen-elicitation-test", version: "1.0.0" },
    { capabilities: { elicitation: { form: {} } } },
  );
  const server = createApiTypeGenMcpServer();
  const elicitationRequests = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    elicitationRequests.push(request);
    return { action: "accept", content: { url: "https://example.test/openapi.json" } };
  });

  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const result = await client.callTool({
      name: "search_apis",
      arguments: {
        source: { type: "openapi", url: "https://example.test/swagger-ui/" },
        keyword: "登录",
        refresh: true,
      },
    });

    assert.equal(elicitationRequests.length, 1);
    assert.equal(elicitationRequests[0].method, "elicitation/create");
    assert.deepEqual(elicitationRequests[0].params.requestedSchema.required, ["url"]);
    assert.equal(result.structuredContent.ok, true);
    assert.equal(result.structuredContent.data.returned, 1);
    assert.equal(result.structuredContent.data.items[0].selector.path, "/login");
  } finally {
    await client.close();
    await server.close();
    globalThis.fetch = originalFetch;
  }
});
