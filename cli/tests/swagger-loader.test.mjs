import assert from "node:assert/strict";
import test from "node:test";
import {
  isOpenApiLike,
  isSwaggerConfigLike,
  normalizeSwaggerConfig,
} from "../dist/core/swagger-loader.js";

test("只识别带规范版本和 paths 的 OpenAPI 文档", () => {
  assert.equal(isOpenApiLike({ openapi: "3.0.3", paths: {} }), true);
  assert.equal(isOpenApiLike({ swagger: "2.0", paths: {} }), true);
  assert.equal(isOpenApiLike({ paths: { value: "普通业务字段" } }), false);
  assert.equal(isOpenApiLike({ openapi: "3.0.3" }), false);
});

test("识别单文档和多服务 swagger-config", () => {
  assert.equal(isSwaggerConfigLike({ url: "/v3/api-docs" }), true);
  assert.equal(
    isSwaggerConfigLike({ urls: [{ name: "订单服务", url: "/order/v3/api-docs" }] }),
    true,
  );
  assert.equal(isSwaggerConfigLike({ urls: [] }), false);
  assert.equal(isSwaggerConfigLike({ openapi: "3.0.3", paths: {} }), false);
});

test("相对服务地址按 config 响应地址转为绝对 URL", () => {
  const config = normalizeSwaggerConfig(
    { urls: [{ name: "订单服务", url: "../order/v3/api-docs" }] },
    "https://example.com/docs/swagger-config",
  );

  assert.deepEqual(config.urls, [
    { name: "订单服务", url: "https://example.com/order/v3/api-docs" },
  ]);
});

test("单文档 config 归一化为 default 服务", () => {
  const config = normalizeSwaggerConfig(
    { url: "/v3/api-docs" },
    "https://example.com/swagger-config",
  );

  assert.deepEqual(config.urls, [
    { name: "default", url: "https://example.com/v3/api-docs" },
  ]);
});
