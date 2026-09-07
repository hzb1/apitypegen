import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(readFileSync(path.join(root, "tests/fixtures-complex-schema.json"), "utf8"));
const { SwaggerToTS } = await import("../dist/core/swagger-to-ts.js");

test("复杂 Schema 生成联合类型、可空字段和字典类型", () => {
  const generated = new SwaggerToTS(fixture).getStructuredTypes("/orders/{id}", "get");
  assert.match(generated.models, /Entity/);
  assert.match(generated.models, /export type Order = Entity &/);
  assert.doesNotMatch(generated.models, /interface Order Entity/);
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

test("不同状态只包含各自引用的模型，保留组合与循环引用的传递依赖", () => {
  const generated = new SwaggerToTS(fixture).getStructuredTypes("/orders/{id}", "get");
  const success = generated.responses.find((item) => item.status === "200");
  const missing = generated.responses.find((item) => item.status === "404");

  assert.match(success.models, /type Order = Entity &/);
  assert.match(success.models, /interface Entity/);
  assert.match(success.models, /interface Event/);
  assert.match(success.models, /parent\?: Entity/);
  assert.equal(missing.models, "", "内联响应没有引用模型时，不能沿用 200 的模型");
  assert.equal(generated.models, success.models, "完整模型集合保留所有响应的依赖");
});

test("响应模型隔离后仍保留公共请求依赖，单状态代码可以独立通过类型检查", () => {
  const doc = structuredClone(fixture);
  doc.components.schemas.Input = {
    type: "object",
    properties: { filter: { $ref: "#/components/schemas/Filter" } },
  };
  doc.components.schemas.Filter = { type: "object", properties: { text: { type: "string" } } };
  doc.components.schemas.ApiError = { type: "object", properties: { reason: { type: "string" } } };
  const operation = doc.paths["/orders/{id}"].get;
  operation.requestBody = { content: { "application/json": { schema: { $ref: "#/components/schemas/Input" } } } };
  operation.responses["404"].content["application/json"].schema = { $ref: "#/components/schemas/ApiError" };
  operation.responses["204"] = { description: "无内容" };
  operation.responses.default = operation.responses["404"];
  const parser = new SwaggerToTS(doc);
  const generated = parser.getStructuredTypes("/orders/{id}", "get");

  for (const response of generated.responses) {
    assert.match(response.models, /interface Input/);
    assert.match(response.models, /interface Filter/);
    if (response.status === "200") {
      assert.match(response.models, /type Order/);
      assert.doesNotMatch(response.models, /interface ApiError/);
    } else {
      assert.doesNotMatch(response.models, /type Order|interface Entity|interface Event/);
    }
    if (response.status === "404" || response.status === "default") {
      assert.match(response.models, /interface ApiError/);
    }

    const fileName = path.join(root, `generated-response-${response.status}.ts`);
    const code = [response.models, generated.queryParams, generated.requestBody, response.code].join("\n\n");
    const options = { noEmit: true, strict: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ESNext };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (name, ...args) => name === fileName
      ? ts.createSourceFile(name, code, ts.ScriptTarget.ESNext, true)
      : getSourceFile(name, ...args);
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([fileName], options, host));
    assert.deepEqual(diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")), [], response.status);
  }

  assert.match(generated.models, /type Order/);
  assert.match(generated.models, /interface ApiError/);
  assert.equal((generated.models.match(/interface Input /g) || []).length, 1);
  assert.deepEqual(parser.getStructuredTypes("/orders/{id}", "get"), generated, "重复生成不残留上次的响应依赖");
});

test("解析 components 中的请求体、响应引用并将枚举声明为合法 type", async () => {
  const document = JSON.parse(readFileSync("/tmp/apitypegen-allauth.json", "utf8"));
  const generated = new SwaggerToTS(document).getStructuredTypes("/_allauth/browser/v1/auth/login", "post");
  assert.match(generated.requestBody, /RequestBody = Login/);
  assert.match(generated.responses.find((item) => item.status === "200")?.code || "", /AuthenticatedResponse/);
  assert.match(generated.models, /export type AuthenticatorType =/);
  assert.doesNotMatch(generated.models, /interface AuthenticatorType/);
  assert.match(generated.models, /export type Timestamp = number/);
  assert.match(generated.models, /export type ProviderID = string/);
  assert.match(generated.models, /export type ProviderAccountID = string/);
  assert.doesNotMatch(generated.models, /interface (Timestamp|ProviderID|ProviderAccountID)/);
});
