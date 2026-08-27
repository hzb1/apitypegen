import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repositoryRoot, "dist/cli/ts-swagger.js");
const emptyCwd = mkdtempSync(path.join(tmpdir(), "ts-swagger-cli-test-"));

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: emptyCwd,
    encoding: "utf8",
    env: {
      ...process.env,
      TS_SWAGGER_TYPE: "",
      TS_SWAGGER_URL: "",
      TS_SWAGGER_HOST: "",
    },
  });
}

test("帮助信息只展示 type/url 三种来源", () => {
  const result = runCli(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--type <ui\|openapi\|config>/);
  assert.doesNotMatch(result.stdout, /--host/);
  assert.doesNotMatch(result.stdout, /--doc-url/);
});

test("旧 host 参数返回迁移提示", () => {
  const result = runCli(["services", "--host", "http://localhost:9999"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /参数 --host 已删除/);
  assert.match(result.stderr, /--type config --url/);
});

test("host 不再是合法来源类型", () => {
  const result = runCli([
    "services",
    "--type",
    "host",
    "--url",
    "http://localhost:9999",
    "--no-interactive",
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /无效的 --type "host"/);
});

test("非交互模式要求 type 和 url 成对提供", () => {
  const result = runCli(["services", "--type", "config", "--no-interactive"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--type 和 --url 必须同时提供/);
});

test("未知参数不会被静默忽略", () => {
  const result = runCli(["services", "--unknown", "value"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /不支持参数 --unknown/);
});
