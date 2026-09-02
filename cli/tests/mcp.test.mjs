import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
        keyword: "订单详情",
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
    assert.match(generateResult.structuredContent.data.code, /响应数据/);
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
    "请提供接口文档类型和完整 URL 后重试。",
  );
});

test("resolve_source 接受 Elicitation 后返回已确认的 OpenAPI 来源", async () => {
  const { executeResolveSourceTool } = await import("../dist/mcp/server.js");
  const originalFetch = globalThis.fetch;
  let elicitationRequest;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ openapi: "3.0.0", paths: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const fakeServer = {
    server: {
      getClientCapabilities: () => ({ elicitation: { form: {} } }),
      elicitInput: async (request) => {
        elicitationRequest = request;
        return {
          action: "accept",
          content: {
            sourceType: "openapi",
            url: "https://example.test/openapi.json",
          },
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
    assert.equal(elicitationRequest.mode, "form");
    assert.deepEqual(elicitationRequest.requestedSchema.required, ["sourceType", "url"]);
    assert.ok(
      elicitationRequest.requestedSchema.properties.sourceType.oneOf.some(
        (option) => option.const === "openapi",
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolve_source 选择类型与实际响应不一致时返回稳定错误", async () => {
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
        content: {
          sourceType: "openapi",
          url: "https://example.test/swagger-ui/",
        },
      }),
    },
  };

  try {
    const result = await executeResolveSourceTool({}, fakeServer);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, "INVALID_ARGUMENT");
    assert.match(result.structuredContent.error.message, /实际响应识别为 page/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
