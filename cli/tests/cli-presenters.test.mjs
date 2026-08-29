import assert from "node:assert/strict";
import test from "node:test";
import {
  createProgressReporter,
  presentFailure,
  presentGenResult,
  presentInspectResult,
  presentSearchResult,
} from "../dist/cli/presenters.js";
import { CliProtocolError } from "../dist/cli/protocol.js";

function createOutput() {
  let stdout = "";
  let stderr = "";
  return {
    writer: {
      writeStdout: (content) => {
        stdout += content;
      },
      writeStderr: (content) => {
        stderr += content;
      },
    },
    read: () => ({ stdout, stderr }),
  };
}

function createSearchResult(outputFormat) {
  return {
    outputFormat,
    data: {
      host: "http://localhost:9999",
      service: null,
      services: [{ name: "order-service", url: "http://localhost:9999/openapi" }],
      loadedServices: 1,
      failedServices: [],
      keyword: "order",
      total: 1,
      returned: 1,
      limit: 20,
      confirmationRequired: true,
      items: [
        {
          service: "order-service",
          documentUrl: "http://localhost:9999/openapi",
          key: "POST /orders",
          path: "/orders",
          method: "post",
          summary: "创建订单",
          description: "",
          operationId: "createOrder",
          tags: ["Order"],
          selector: {
            service: "order-service",
            method: "post",
            path: "/orders",
          },
        },
      ],
    },
    warnings: [],
  };
}

test("JSON Presenter 只向 stdout 写入单一稳定协议对象", () => {
  const output = createOutput();
  presentSearchResult(createSearchResult("json"), output.writer);

  const captured = output.read();
  assert.equal(captured.stderr, "");
  const protocol = JSON.parse(captured.stdout);
  assert.equal(protocol.schemaVersion, 1);
  assert.equal(protocol.ok, true);
  assert.equal(protocol.command, "search");
  assert.equal(protocol.data.items[0].selector.service, "order-service");
});

test("inspect Presenter 支持文本与稳定 JSON 输出", () => {
  const data = {
    source: { type: "openapi", url: "http://localhost:9999/openapi" },
    resolvedUrl: "http://localhost:9999/openapi",
    status: 200,
    contentType: "application/json",
    reason: "JSON 包含 OpenAPI 版本字段以及 paths",
  };
  const jsonOutput = createOutput();
  presentInspectResult({ outputFormat: "json", data }, jsonOutput.writer);
  const protocol = JSON.parse(jsonOutput.read().stdout);
  assert.equal(protocol.schemaVersion, 1);
  assert.equal(protocol.command, "inspect");
  assert.equal(protocol.data.source.type, "openapi");

  const textOutput = createOutput();
  presentInspectResult({ outputFormat: "text", data }, textOutput.writer);
  assert.match(textOutput.read().stdout, /来源类型: openapi/);
  assert.match(textOutput.read().stdout, /判定依据:/);
});

test("Human Presenter 使用同一搜索结果生成文本", () => {
  const output = createOutput();
  presentSearchResult(createSearchResult("text"), output.writer);

  const captured = output.read();
  assert.equal(captured.stderr, "");
  assert.match(captured.stdout, /关键词: order/);
  assert.match(captured.stdout, /\[order-service\] POST \/orders  \/\/ 创建订单/);
});

test("gen Presenter 保持 JSON、TypeScript 与复制提示的输出边界", () => {
  const jsonOutput = createOutput();
  const data = {
    host: "http://localhost:9999",
    service: "order-service",
    documentUrl: "http://localhost:9999/openapi",
    selector: { service: "order-service", method: "post", path: "/orders" },
    matchedApi: {
      key: "POST /orders",
      path: "/orders",
      method: "post",
      summary: "创建订单",
      description: "",
      operationId: "createOrder",
      tags: ["Order"],
    },
    code: "export interface Order {}",
    parts: {
      models: "export interface Order {}",
      queryParams: "",
      requestBody: "",
      responseData: "",
    },
  };
  presentGenResult({ outputFormat: "json", data, copied: true }, jsonOutput.writer);
  assert.equal(JSON.parse(jsonOutput.read().stdout).data.code, data.code);
  assert.equal(jsonOutput.read().stderr, "已复制生成的 TypeScript 到剪贴板。\n");

  const textOutput = createOutput();
  presentGenResult({ outputFormat: "ts", data, copied: false }, textOutput.writer);
  assert.equal(textOutput.read().stdout, `${data.code}\n`);
  assert.equal(textOutput.read().stderr, "");
});

test("错误与进度展示保持 stdout 和 stderr 分离", () => {
  const recoveryError = new CliProtocolError(
    "AMBIGUOUS_API",
    "多个服务中存在相同 API",
    undefined,
    {
      action: "retry",
      message: "指定服务后重试",
      commands: [
        {
          command: "gen",
          args: ["--service", "order-service", "--method", "get", "--path", "/health"],
        },
      ],
    },
  );

  const jsonOutput = createOutput();
  const normalized = presentFailure("gen", true, recoveryError, jsonOutput.writer);
  assert.equal(normalized, recoveryError);
  assert.equal(jsonOutput.read().stderr, "");
  assert.equal(JSON.parse(jsonOutput.read().stdout).error.recovery.action, "retry");

  const textOutput = createOutput();
  presentFailure("gen", false, recoveryError, textOutput.writer);
  createProgressReporter(textOutput.writer).report("加载 1/2");
  assert.equal(textOutput.read().stdout, "");
  assert.match(textOutput.read().stderr, /修复建议: 指定服务后重试/);
  assert.match(textOutput.read().stderr, /apitypegen gen --service order-service/);
  assert.match(textOutput.read().stderr, /加载 1\/2/);
});
