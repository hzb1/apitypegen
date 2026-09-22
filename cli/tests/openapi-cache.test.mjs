import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadOpenApiDocumentWithCache } from "../dist/core/openapi-cache.js";

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

test("OpenAPI 缓存支持命中、条件校验和强制刷新", async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "apitypegen-openapi-cache-"));
  const requests = [];
  let revision = 1;
  const server = http.createServer((request, response) => {
    const etag = `\"revision-${revision}\"`;
    requests.push({
      url: request.url,
      ifNoneMatch: request.headers["if-none-match"],
    });
    if (request.headers["if-none-match"] === etag) {
      response.statusCode = 304;
      response.end();
      return;
    }
    response.setHeader("content-type", "application/json");
    response.setHeader("etag", etag);
    response.setHeader("last-modified", "Wed, 27 Aug 2026 00:00:00 GMT");
    response.end(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: `Revision ${revision}` },
        paths: {},
      }),
    );
  });

  try {
    const address = await listen(server);
    const documentUrl = `http://127.0.0.1:${address.port}/openapi?token=secret-value`;
    const options = { cacheDir, ttlMs: 5 * 60 * 1000, timeoutMs: 2000 };

    const first = await loadOpenApiDocumentWithCache(documentUrl, options);
    assert.equal(first.cacheStatus, "miss");
    assert.equal(first.document.info.title, "Revision 1");
    assert.equal(requests.length, 1);

    const second = await loadOpenApiDocumentWithCache(documentUrl, options);
    assert.equal(second.cacheStatus, "hit");
    assert.equal(requests.length, 1);

    const validated = await loadOpenApiDocumentWithCache(documentUrl, {
      ...options,
      refresh: true,
    });
    assert.equal(validated.cacheStatus, "validated");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].ifNoneMatch, '"revision-1"');

    revision = 2;
    const refreshed = await loadOpenApiDocumentWithCache(documentUrl, {
      ...options,
      refresh: true,
    });
    assert.equal(refreshed.cacheStatus, "refreshed");
    assert.equal(refreshed.document.info.title, "Revision 2");
    assert.equal(requests.length, 3);
    assert.equal(requests[2].ifNoneMatch, '"revision-1"');

    const files = await readdir(cacheDir);
    assert.equal(files.length, 1);
    assert.match(files[0], /^[a-f0-9]{64}\.json$/);
    const cachePath = path.join(cacheDir, files[0]);
    const cacheContent = await readFile(cachePath, "utf8");
    assert.doesNotMatch(cacheContent, /secret-value|token=/);
    if (process.platform !== "win32") {
      assert.equal((await stat(cacheDir)).mode & 0o777, 0o700);
      assert.equal((await stat(cachePath)).mode & 0o777, 0o600);
    }
  } finally {
    await close(server);
  }
});

test("相同文档的并发加载与强制刷新共用一次请求", async (t) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "apitypegen-openapi-concurrent-"));
  const documentUrl = "https://example.test/concurrent-openapi";
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    requests.push(options?.headers?.["If-None-Match"]);
    if (options?.headers?.["If-None-Match"] === '"revision-1"') {
      return new Response(null, { status: 304 });
    }
    return new Response(
      JSON.stringify({ openapi: "3.0.0", info: { title: "Concurrent" }, paths: {} }),
      { status: 200, headers: { etag: '"revision-1"' } },
    );
  });

  try {
    const options = { cacheDir, timeoutMs: 2000 };
    const initial = await Promise.all([
      loadOpenApiDocumentWithCache(documentUrl, options),
      loadOpenApiDocumentWithCache(documentUrl, options),
    ]);
    assert.deepEqual(initial.map((result) => result.cacheStatus), ["miss", "miss"]);
    assert.deepEqual(requests, [undefined]);

    const refreshed = await Promise.all([
      loadOpenApiDocumentWithCache(documentUrl, { ...options, refresh: true }),
      loadOpenApiDocumentWithCache(documentUrl, { ...options, refresh: true }),
    ]);
    assert.deepEqual(refreshed.map((result) => result.cacheStatus), ["validated", "validated"]);
    assert.deepEqual(requests, [undefined, '"revision-1"']);

    await loadOpenApiDocumentWithCache(documentUrl, { ...options, refresh: true });
    assert.deepEqual(requests, [undefined, '"revision-1"', '"revision-1"']);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test("不同文档仍可并发加载", async (t) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "apitypegen-openapi-distinct-"));
  let activeRequests = 0;
  let peakRequests = 0;
  let releaseResponses;
  const responsesReady = new Promise((resolve) => {
    releaseResponses = resolve;
  });
  const timer = setTimeout(() => releaseResponses(), 1000);
  t.mock.method(globalThis, "fetch", async (url) => {
    activeRequests += 1;
    peakRequests = Math.max(peakRequests, activeRequests);
    if (activeRequests === 2) releaseResponses();
    await responsesReady;
    activeRequests -= 1;
    return new Response(
      JSON.stringify({ openapi: "3.0.0", info: { title: String(url) }, paths: {} }),
      { status: 200 },
    );
  });

  try {
    const results = await Promise.all([
      loadOpenApiDocumentWithCache("https://example.test/first", { cacheDir }),
      loadOpenApiDocumentWithCache("https://example.test/second", { cacheDir }),
    ]);
    assert.equal(peakRequests, 2);
    assert.deepEqual(results.map((result) => result.cacheStatus), ["miss", "miss"]);
  } finally {
    clearTimeout(timer);
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test("并发加载失败后允许重新请求", async (t) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "apitypegen-openapi-retry-"));
  const documentUrl = "https://example.test/retry-openapi";
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests += 1;
    if (requests === 1) return new Response(null, { status: 503 });
    return new Response(
      JSON.stringify({ openapi: "3.0.0", info: { title: "Retry" }, paths: {} }),
      { status: 200 },
    );
  });

  try {
    const options = { cacheDir };
    const failures = await Promise.allSettled([
      loadOpenApiDocumentWithCache(documentUrl, options),
      loadOpenApiDocumentWithCache(documentUrl, options),
    ]);
    assert.deepEqual(failures.map((result) => result.status), ["rejected", "rejected"]);
    assert.equal(requests, 1);

    const retried = await loadOpenApiDocumentWithCache(documentUrl, options);
    assert.equal(retried.cacheStatus, "miss");
    assert.equal(requests, 2);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});
