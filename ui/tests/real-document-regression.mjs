import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { chromium } from "playwright-core";
import ts from "typescript";

const uiRoot = new URL("..", import.meta.url).pathname;
const uiBaseUrl = process.env.APITYPEGEN_UI_BASE_URL || "http://127.0.0.1:6699";
const documentUrl = process.env.APITYPEGEN_REGRESSION_DOCUMENT_URL
  || "https://monitor.huzhibin.top/_allauth/openapi.json";
const loginApi = process.env.APITYPEGEN_REGRESSION_API || "api-591b9001";

async function waitForUi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(uiBaseUrl);
      if (response.ok) return;
    } catch {
      // Vite 尚未启动，继续等待。
    }
    await delay(250);
  }
  throw new Error(`UI 开发服务器未在 ${uiBaseUrl} 启动`);
}

async function startUiIfNeeded() {
  try {
    const response = await fetch(uiBaseUrl);
    if (response.ok) return undefined;
  } catch {
    // 由测试启动本地 UI。
  }

  const child = spawn(process.execPath, ["./node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
    cwd: uiRoot,
    stdio: "ignore",
  });
  await waitForUi();
  return child;
}

function assertTypeScriptCompiles(code) {
  const fileName = "/tmp/apitypegen-ui-real-document.ts";
  const options = { noEmit: true, strict: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ESNext };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...args) => name === fileName
    ? ts.createSourceFile(name, code, ts.ScriptTarget.ESNext, true)
    : getSourceFile(name, ...args);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([fileName], options, host));
  assert.deepEqual(diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")), []);
}

test("真实 OpenAPI 文档的请求与响应卡片均可复制完整类型", async () => {
  const server = await startUiIfNeeded();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async (text) => { window.__copiedText = text; } },
      });
    });
    const pageUrl = `${uiBaseUrl}/?doc=${encodeURIComponent(documentUrl)}&api=${encodeURIComponent(loginApi)}`;
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 90_000 });
    await page.getByText("Login", { exact: true }).first().waitFor({ timeout: 30_000 });
    assert.equal(await page.getByText("生成的 TypeScript 未通过语法校验", { exact: true }).count(), 0);

    const responseCode = page.locator(".api-doc__response .code-card-code");
    const responseTabs = page.getByRole("group", { name: "响应状态选择", exact: true });
    const requestCodeCards = page.locator(".api-doc__main .code-card-code");
    const requestBodyCard = page.locator(".api-doc__main .code-card").filter({ hasText: "Request body" });
    const responseCard = page.locator(".api-doc__response .code-card");

    assert.equal(await page.locator('text=请求体  有').count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Request", exact: true }).count(), 0);
    assert.equal(await page.getByRole("heading", { name: "Response", exact: true }).count(), 0);
    assert.match(await requestCodeCards.nth(1).innerText(), /RequestBody = Login/);
    const workspaceBox = await page.locator(".left-main").boundingBox();
    const requestBodyBox = await requestBodyCard.boundingBox();
    const responseBox = await responseCard.boundingBox();
    assert.ok(workspaceBox && requestBodyBox && responseBox, "代码工作区和填充卡片必须可见");
    const workspaceBottom = workspaceBox.y + workspaceBox.height;
    assert.ok(requestBodyBox.y + requestBodyBox.height >= workspaceBottom - 24, "Request body 应填满工作区高度");
    assert.ok(responseBox.y + responseBox.height >= workspaceBottom - 24, "Response 应填满工作区高度");
    const responseTabLabels = (await responseTabs.getByRole("button").allTextContents())
      .map((value) => value.replace(/\s+/g, " ").trim());
    assert.deepEqual(responseTabLabels, [
      "200",
      "400",
      "401",
      "409",
      "全部响应",
    ]);

    await responseTabs.getByRole("button", { name: /^400/ }).click();
    await page.waitForFunction(() => document.querySelector(".api-doc__response .code-card-code")?.textContent?.includes("ErrorResponse"));
    assert.match(await responseCode.innerText(), /ErrorResponse/);
    assert.doesNotMatch(await responseCode.innerText(), /AuthenticationResponse/);
    await page.locator(".api-doc__response .code-card-action").click();
    assert.equal((await page.evaluate(() => window.__copiedText)).trim(), (await responseCode.innerText()).trim());

    await responseTabs.getByRole("button", { name: /^401/ }).click();
    await page.waitForFunction(() => document.querySelector(".api-doc__response .code-card-code")?.textContent?.includes("AuthenticationResponse"));
    assert.match(await responseCode.innerText(), /AuthenticationResponse/);

    await responseTabs.getByRole("button", { name: "全部响应", exact: true }).click();
    const allResponseCode = await responseCode.innerText();
    assert.match(allResponseCode, /export type ResponseData = Response200 \| Response400 \| Response401 \| Response409/);
    assert.match(allResponseCode, /Response200/);
    assert.match(allResponseCode, /Response400/);
    assert.match(allResponseCode, /Response401/);
    assert.match(allResponseCode, /Response409/);
    assert.match(allResponseCode, /ErrorResponse/);
    assert.match(allResponseCode, /AuthenticationResponse/);
    assert.match(allResponseCode, /ConflictResponse/);
    assertTypeScriptCompiles(allResponseCode);

    const signupLink = page.locator("aside").getByText("Signup", { exact: true });
    await signupLink.click();
    await page.waitForFunction(() => document.querySelector(".api-doc__title-row")?.textContent?.includes("Signup"));
    assert.equal(await responseTabs.getByRole("button", { name: "全部响应", exact: true }).getAttribute("aria-pressed"), "true");

    await page.goto(`${uiBaseUrl}/?doc=${encodeURIComponent("/demo/invalid-typescript.json")}&demo=1`);
    await page.locator("aside").getByText("Default", { exact: true }).click();
    await page.locator("aside").getByText("Invalid type", { exact: true }).click();
    const syntaxAlert = page.getByText("生成的 TypeScript 未通过语法校验", { exact: true });
    await syntaxAlert.waitFor();
    const gridBeforeDismiss = await page.locator(".api-workspace-grid").boundingBox();
    await page.locator(".typescript-syntax-alert .ant-alert-close-icon").click();
    await syntaxAlert.waitFor({ state: "hidden" });
    const gridAfterDismiss = await page.locator(".api-workspace-grid").boundingBox();
    assert.deepEqual(gridBeforeDismiss, gridAfterDismiss, "语法错误提示不能改变代码工作区布局");
  } finally {
    await browser.close();
    server?.kill();
  }
});
