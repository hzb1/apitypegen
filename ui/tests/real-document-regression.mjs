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

test("真实 OpenAPI 文档的响应 tabs 与 Models 联动回归", async () => {
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

    const responseCode = page.locator('section[aria-label="响应代码"] .code-card-code');
    const modelsCode = page.locator(".models-panel .code-card-code");
    const leftTabs = page.getByRole("group", { name: "响应状态选择", exact: true });
    const rightTabs = page.getByRole("group", { name: "Models 响应状态选择", exact: true });
    const codeCards = page.locator(".left-main .code-card-code");

    assert.equal(await page.locator('text=请求体  有').count(), 1);
    assert.match(await codeCards.nth(1).innerText(), /RequestBody = Login/);
    const responseTabs = (await rightTabs.getByRole("button").allTextContents())
      .map((value) => value.replace(/\s+/g, " ").trim());
    assert.deepEqual(responseTabs, [
      "全部响应",
      "200 · Authenticated by password.",
      "400 · An input error occurred.",
      "401 · Not authenticated.",
      "409 · Conflict. For example, when logging in when a user is already logged in.",
    ]);

    await rightTabs.getByRole("button", { name: /^400/ }).click();
    await page.waitForFunction(() => document.querySelector(".models-panel .code-card-code")?.textContent?.includes("ErrorResponse"));
    assert.match(await responseCode.innerText(), /ErrorResponse/);
    assert.match(await modelsCode.innerText(), /ErrorResponse/);
    assert.doesNotMatch(await modelsCode.innerText(), /AuthenticationResponse/);
    assert.equal(await leftTabs.getByRole("button", { name: /^400/ }).getAttribute("aria-pressed"), "true");
    await page.locator(".models-panel .code-card-action").click();
    assert.equal((await page.evaluate(() => window.__copiedText)).trim(), (await modelsCode.innerText()).trim());

    await leftTabs.getByRole("button", { name: /^401/ }).click();
    await page.waitForFunction(() => document.querySelector(".models-panel .code-card-code")?.textContent?.includes("AuthenticationResponse"));
    assert.match(await responseCode.innerText(), /AuthenticationResponse/);
    assert.match(await modelsCode.innerText(), /AuthenticationResponse/);
    assert.equal(await rightTabs.getByRole("button", { name: /^401/ }).getAttribute("aria-pressed"), "true");

    await rightTabs.getByRole("button", { name: "全部响应", exact: true }).click();
    const allModels = await modelsCode.innerText();
    assert.match(allModels, /ErrorResponse/);
    assert.match(allModels, /AuthenticationResponse/);
    assert.match(allModels, /ConflictResponse/);
    const allResponseCode = await responseCode.innerText();
    assert.match(allResponseCode, /Response200/);
    assert.match(allResponseCode, /Response400/);
    assert.match(allResponseCode, /Response401/);
    assert.match(allResponseCode, /Response409/);
    assertTypeScriptCompiles([
      allModels,
      await codeCards.nth(0).innerText(),
      await codeCards.nth(1).innerText(),
      allResponseCode,
    ].join("\n\n"));

    const signupLink = page.locator("aside").getByText("Signup", { exact: true });
    await signupLink.click();
    await page.waitForFunction(() => document.querySelector(".api-doc-title-row")?.textContent?.includes("Signup"));
    assert.equal(await rightTabs.getByRole("button", { name: "全部响应", exact: true }).getAttribute("aria-pressed"), "true");

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
