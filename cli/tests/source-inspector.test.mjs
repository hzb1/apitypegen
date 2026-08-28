import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { inspectSwaggerSource } from "../dist/core/source-inspector.js";

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

test("来源识别只读取准确 URL 并按内容区分三种来源", async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    if (request.url === "/page") {
      response.setHeader("content-type", "text/html");
      response.end("<!doctype html><html><body>Swagger UI</body></html>");
      return;
    }
    response.setHeader("content-type", "application/json");
    if (request.url === "/openapi") {
      response.end(JSON.stringify({ openapi: "3.0.0", paths: {} }));
      return;
    }
    if (request.url === "/config") {
      response.end(JSON.stringify({ urls: [{ name: "demo", url: "/openapi" }] }));
      return;
    }
    response.end(JSON.stringify({ paths: { ordinary: true } }));
  });

  try {
    const address = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const page = await inspectSwaggerSource(`${baseUrl}/page`, { timeoutMs: 1000 });
    const openapi = await inspectSwaggerSource(`${baseUrl}/openapi`, { timeoutMs: 1000 });
    const config = await inspectSwaggerSource(`${baseUrl}/config`, { timeoutMs: 1000 });

    assert.equal(page.source.type, "page");
    assert.equal(openapi.source.type, "openapi");
    assert.equal(config.source.type, "swagger-config");
    assert.deepEqual(requests, ["/page", "/openapi", "/config"]);

    await assert.rejects(
      inspectSwaggerSource(`${baseUrl}/ordinary`, { timeoutMs: 1000 }),
      /无法识别接口文档来源/,
    );
    assert.deepEqual(requests, ["/page", "/openapi", "/config", "/ordinary"]);
  } finally {
    await close(server);
  }
});
