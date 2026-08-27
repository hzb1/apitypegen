import { chromium, type Browser, type Response } from "playwright-core";
import {
  isOpenApiLike,
  isSwaggerConfigLike,
  normalizeSwaggerConfig,
  type SwaggerConfig,
} from "./swagger-loader.js";
import {
  createCapturedOpenApiDocument,
  type CapturedOpenApiDocument,
  type ResolvedSwaggerSource,
  type ResolveSwaggerSourceOptions,
} from "./swagger-source.js";

const MAX_RESPONSE_BODY_BYTES = 25 * 1024 * 1024;
const DISCOVERY_POLL_INTERVAL_MS = 100;
const DOCUMENT_SETTLE_DELAY_MS = 500;
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const INSPECTABLE_RESOURCE_TYPES = new Set(["xhr", "fetch", "document"]);

/** 浏览器响应中识别出的 Swagger 候选内容。 */
type BrowserCandidate =
  | {
      /** 候选内容是 OpenAPI 文档。 */
      kind: "openapi";

      /** 已验证的 OpenAPI 文档。 */
      document: CapturedOpenApiDocument;
    }
  | {
      /** 候选内容是 swagger-config。 */
      kind: "swagger-config";

      /** swagger-config 响应地址。 */
      configUrl: string;

      /** 已规范化的 Swagger 服务配置。 */
      config: SwaggerConfig;
    };

/** 浏览器发现等待过程读取的动态状态。 */
type DiscoveryState = {
  /** 发现过程的截止时间戳。 */
  deadline: number;

  /** 读取当前 swagger-config 候选的函数。 */
  getConfig: () => BrowserCandidate | undefined;

  /** 读取当前 OpenAPI 文档数量的函数。 */
  getDocumentCount: () => number;

  /** 读取最后一次捕获有效内容时间的函数。 */
  getLastCaptureAt: () => number;
};

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

function parseJson(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

async function launchSystemChrome(chromePath?: string): Promise<Browser> {
  try {
    if (chromePath) {
      return await chromium.launch({ executablePath: chromePath, headless: true });
    }
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `无法启动系统 Chrome。请确认已安装 Google Chrome，或使用 --chrome-path / TS_SWAGGER_CHROME_PATH 指定可执行文件。原始错误: ${message}`,
    );
  }
}

async function inspectSwaggerResponse(response: Response): Promise<BrowserCandidate | undefined> {
  const request = response.request();
  if (request.method().toUpperCase() !== "GET") return undefined;
  if (!INSPECTABLE_RESOURCE_TYPES.has(request.resourceType())) return undefined;
  if (response.status() < 200 || response.status() >= 300) return undefined;

  const declaredLength = Number(response.headers()["content-length"] || 0);
  if (declaredLength > MAX_RESPONSE_BODY_BYTES) return undefined;

  let body: Buffer;
  try {
    body = await response.body();
  } catch {
    return undefined;
  }
  if (body.byteLength > MAX_RESPONSE_BODY_BYTES) return undefined;

  const data = parseJson(body);
  if (isOpenApiLike(data)) {
    return {
      kind: "openapi",
      document: createCapturedOpenApiDocument(response.url(), data),
    };
  }
  if (isSwaggerConfigLike(data)) {
    return {
      kind: "swagger-config",
      configUrl: response.url(),
      config: normalizeSwaggerConfig(data, response.url()),
    };
  }
  return undefined;
}

async function waitForDiscoveryToSettle(state: DiscoveryState): Promise<void> {
  while (Date.now() < state.deadline) {
    if (state.getConfig()?.kind === "swagger-config") return;
    if (
      state.getDocumentCount() > 0 &&
      Date.now() - state.getLastCaptureAt() >= DOCUMENT_SETTLE_DELAY_MS
    ) {
      return;
    }
    await delay(DISCOVERY_POLL_INTERVAL_MS);
  }
}

/** 使用隔离的系统 Chrome 会话，从页面真实网络响应中发现 OpenAPI 来源。 */
export async function discoverOpenApiFromBrowser(
  pageUrl: string,
  options: ResolveSwaggerSourceOptions,
): Promise<ResolvedSwaggerSource> {
  const browser = await launchSystemChrome(options.chromePath);
  const context = await browser.newContext({
    acceptDownloads: false,
    serviceWorkers: "block",
  });
  const capturedDocuments = new Map<string, CapturedOpenApiDocument>();
  const pendingResponses = new Set<Promise<void>>();
  let capturedConfig: Extract<BrowserCandidate, { kind: "swagger-config" }> | undefined;
  let lastCaptureAt = 0;
  const deadline = Date.now() + options.timeoutMs;

  try {
    await context.route("**/*", async (route) => {
      if (READ_ONLY_METHODS.has(route.request().method().toUpperCase())) {
        await route.continue();
      } else {
        await route.abort("blockedbyclient");
      }
    });

    const page = await context.newPage();
    page.on("response", (response) => {
      const task = inspectSwaggerResponse(response)
        .then((candidate) => {
          if (!candidate) return;
          lastCaptureAt = Date.now();
          if (candidate.kind === "swagger-config") {
            capturedConfig = candidate;
          } else {
            capturedDocuments.set(candidate.document.documentUrl, candidate.document);
          }
        })
        .catch(() => undefined);

      pendingResponses.add(task);
      void task.finally(() => pendingResponses.delete(task));
    });

    const navigationTimeoutMs = Math.max(1, deadline - Date.now());
    await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeoutMs,
    });

    await waitForDiscoveryToSettle({
      deadline,
      getConfig: () => capturedConfig,
      getDocumentCount: () => capturedDocuments.size,
      getLastCaptureAt: () => lastCaptureAt,
    });
    await Promise.allSettled([...pendingResponses]);

    if (capturedConfig) {
      return {
        kind: "swagger-config",
        configUrl: capturedConfig.configUrl,
        config: capturedConfig.config,
        capturedDocuments: [...capturedDocuments.values()],
      };
    }
    if (capturedDocuments.size > 0) {
      return { kind: "openapi", documents: [...capturedDocuments.values()] };
    }

    throw new Error(
      `页面已加载，但未捕获到有效的 OpenAPI 或 swagger-config GET 响应：${pageUrl}。请改用 --type openapi 或 --type config 提供准确地址。`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
