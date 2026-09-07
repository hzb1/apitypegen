import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(readFileSync(path.join(root, "tests/fixtures-complex-schema.json"), "utf8"));
const { SwaggerToTS } = await import("../dist/core/swagger-to-ts.js");

test("复杂 Schema 生成联合类型、可空字段和字典类型", () => {
  const generated = new SwaggerToTS(fixture).getStructuredTypes("/orders/{id}", "get");
  assert.match(generated.models, /Entity/);
  assert.match(generated.models, /string \| number/);
  assert.match(generated.models, /string \| null/);
  assert.match(generated.models, /Record<string, string>/);
  assert.match(generated.models, /Event\[\]/);
});

test("生成器按状态码保留全部响应", () => {
  const generated = new SwaggerToTS(fixture).getStructuredTypes("/orders/{id}", "get");
  assert.deepEqual(generated.responses.map((item) => item.status), ["200", "404"]);
  assert.equal(generated.responses[0].description, "成功");
  assert.match(generated.responses[0].code, /Order/);
  assert.match(generated.responses[1].code, /message/);
});

test("不存在的接口返回空响应集合", () => {
  const generated = new SwaggerToTS(fixture).getStructuredTypes("/missing", "get");
  assert.deepEqual(generated.responses, []);
});
