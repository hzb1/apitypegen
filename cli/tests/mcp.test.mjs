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

test("MCP stdio 暴露搜索和生成工具并返回结构化结果", async () => {
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

    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ["generate_typescript", "search_apis"],
    );
    assert.ok(tools.tools.every((tool) => tool.outputSchema));
    assert.deepEqual(
      tools.tools.find((tool) => tool.name === "search_apis")
        .inputSchema.properties.source.properties.type.enum,
      ["page", "openapi", "swagger-config"],
    );

    const searchResult = await client.callTool({
      name: "search_apis",
      arguments: {
        source: { type: "openapi", url: documentUrl },
        keyword: "订单详情",
      },
    });
    assert.equal(searchResult.isError, undefined);
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
      },
    });
    assert.equal(generateResult.isError, undefined);
    assert.equal(generateResult.structuredContent.ok, true);
    assert.match(generateResult.structuredContent.data.code, /响应数据/);
    assert.equal(generateResult.structuredContent.data.selector.path, "/orders/{id}");
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
    timeoutMs: 1000,
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.ok, false);
  assert.equal(typeof result.structuredContent.error.code, "string");
  assert.equal(typeof result.structuredContent.error.message, "string");
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
