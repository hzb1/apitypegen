import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  isCliTelemetryEnabled,
  redactTelemetryText,
  reportUnknownCliError,
  sanitizeTelemetryEvent,
  sendCliTelemetryTestEvent,
} from "../dist/cli/telemetry.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageVersion = JSON.parse(
  readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
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

test("CLI 遥测必须显式开启且允许用环境变量覆盖 DSN", () => {
  assert.equal(isCliTelemetryEnabled({}), false);
  assert.equal(isCliTelemetryEnabled({ TS_SWAGGER_TELEMETRY: "1" }), true);
  assert.equal(
    isCliTelemetryEnabled({
      TS_SWAGGER_TELEMETRY: "true",
      TS_SWAGGER_GLITCHTIP_DSN: "https://public@example.com/1",
    }),
    true,
  );
  assert.equal(
    isCliTelemetryEnabled({
      TS_SWAGGER_TELEMETRY: "1",
      TS_SWAGGER_GLITCHTIP_DSN: "https://public@example.com/1",
      DO_NOT_TRACK: "1",
    }),
    false,
  );
});

test("遥测文本会清理来源地址、认证信息和用户目录", () => {
  const original = [
    "GET https://user:password@internal.example.com/openapi.json?token=secret",
    "Authorization: Bearer top-secret-token",
    "file:///Users/alice/projects/private/dist/cli.js",
    "/home/bob/work/secret/config.json",
    "C:\\Users\\carol\\project\\private.ts",
    "/srv/team/private/config.json",
    "D:\\work\\team\\private.ts",
    "Bearer standalone-secret",
    "owner@example.com",
  ].join("\n");
  const redacted = redactTelemetryText(original);

  assert.match(redacted, /<source-url>/);
  assert.match(redacted, /authorization=<redacted>/i);
  assert.doesNotMatch(
    redacted,
    /password|internal\.example|alice|bob|carol|top-secret-token|\/srv\/team|D:\\work|standalone-secret|owner@example/,
  );
});

test("GlitchTip 事件只保留允许字段并清理堆栈路径", () => {
  const applicationFramePath = path.join(repositoryRoot, "dist/cli/ts-swagger.js");
  const sanitized = sanitizeTelemetryEvent({
    type: undefined,
    event_id: "event-id",
    release: "ts-swagger@0.6.0",
    environment: "production",
    request: { url: "https://private.example.com/openapi.json?token=secret" },
    user: { email: "user@example.com" },
    breadcrumbs: [{ message: "private breadcrumb" }],
    contexts: { private: { value: "private context" } },
    extra: { document: "private OpenAPI document" },
    modules: { private: "1.0.0" },
    server_name: "developer-macbook",
    tags: {
      command: "gen",
      error_code: "UNKNOWN_ERROR",
      node_major: "22",
      platform: "darwin",
      arch: "arm64",
      private_tag: "must be removed",
    },
    exception: {
      values: [
        {
          type: "Error",
          value: "读取 https://private.example.com/openapi.json?token=secret 失败",
          stacktrace: {
            frames: [
              {
                filename: pathToFileURL(applicationFramePath).href,
                abs_path: applicationFramePath,
                function: "runGenerator",
                lineno: 100,
                colno: 12,
                context_line: "const token = 'secret'",
                vars: { token: "secret" },
              },
              {
                filename: "/Users/alice/project/node_modules/dependency/index.js",
                abs_path: "/Users/alice/project/node_modules/dependency/index.js",
                function: "externalFunction",
                lineno: 20,
                context_line: "const privateExternalValue = 'must be removed'",
              },
            ],
          },
        },
      ],
    },
  });
  const serialized = JSON.stringify(sanitized);

  assert.equal(sanitized.exception?.values?.[0]?.value, "读取 <source-url> 失败");
  assert.equal(
    sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename,
    "app:///dist/cli/ts-swagger.js",
  );
  assert.equal(
    sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0]?.context_line,
    "const token=<redacted>",
  );
  assert.equal(
    sanitized.exception?.values?.[0]?.stacktrace?.frames?.[1]?.context_line,
    undefined,
  );
  assert.equal(sanitized.tags?.private_tag, undefined);
  assert.doesNotMatch(
    serialized,
    /private\.example|alice|user@example|breadcrumb|private context|OpenAPI document|developer-macbook|privateExternalValue|vars/,
  );
});

test("默认关闭时错误上报直接返回且不影响调用方", async () => {
  assert.equal(
    await reportUnknownCliError(
      new Error("本地错误"),
      { command: "gen", errorCode: "UNKNOWN_ERROR" },
      {},
    ),
    false,
  );
});

test("实际发送的 GlitchTip envelope 不包含敏感输入", async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({ url: request.url, body });
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
  });
  const address = await listen(server);

  try {
    const sent = await sendCliTelemetryTestEvent(
      {
        TS_SWAGGER_GLITCHTIP_DSN: `http://public@127.0.0.1:${address.port}/1`,
      },
    );

    assert.equal(sent, true);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /^\/api\/1\/envelope\//);
    assert.match(requests[0].body, new RegExp(`ts-swagger@${packageVersion.replaceAll(".", "\\.")}`));
    assert.match(requests[0].body, /UNKNOWN_ERROR/);
    assert.match(requests[0].body, /CLI GlitchTip 诊断测试/);
    assert.match(requests[0].body, /CLI GlitchTip 测试 cause/);
    assert.match(requests[0].body, /createCliTelemetryTestError/);
    assert.match(requests[0].body, /app:\/\/\/dist\/cli\/telemetry\.js/);
    assert.match(requests[0].body, /context_line/);
    assert.match(requests[0].body, /"command":"telemetry-test"/);
    assert.doesNotMatch(
      requests[0].body,
      /\/Users\/|\/home\/|private-command/,
    );
  } finally {
    await close(server);
  }
});
