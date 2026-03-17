import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Drawer,
  Input,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import {
  BarsOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import { proxyFetch, checkPluginEnabled } from "@extension/src/shared/proxySdk.ts";
import {
  ProxyError,
  type ErrorSpec,
  type ProxyResult,
  type RequestBody,
  type RequestSpec,
  type ResponseSpec,
  type TimingInfo,
} from "@extension/src/shared/types.ts";
import { mapProxyExchangeToNetworkEntry } from "@extension/src/shared/networkMapper.ts";
import type { NetworkEntry } from "@extension/src/shared/networkTypes.ts";
import NetworkViewer from "@/components/network/NetworkViewer.tsx";
import "./ProxyFetchDemo.css";

const { Title, Paragraph, Text } = Typography;

type Scenario = {
  id: string;
  title: string;
  description: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  bodyType?: "json" | "text" | "form";
  body?: ScenarioBody;
  timeout?: number;
  abortable?: boolean;
  stream?: boolean;
};

type JsonObject = { [key: string]: JsonValue };
type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
type FormValue = string | number | boolean;
type FormRecord = Record<string, FormValue>;
type ScenarioBody = JsonValue | FormRecord | string;

type ResultState = {
  status: "idle" | "running" | "success" | "error";
  source?: "proxy" | "native";
  durationMs?: number;
  statusCode?: number;
  statusText?: string;
  headers?: Record<string, string>;
  bodyText?: string;
  errorType?: string;
  errorMessage?: string;
};

const EXTENSION_URL =
  (import.meta.env.VITE_PROXY_EXTENSION_URL as string | undefined) ??
  "https://github.com/hzb1/ts-swagger/releases/latest/download/ts-swagger-extension-dist-latest.zip";

const SCENARIOS: Scenario[] = [
  {
    id: "cors-blocked",
    title: "跨域 GET（对比原生 fetch）",
    description: "目标站点无 CORS 头时，原生 fetch 通常会失败；proxyFetch 仍可访问。",
    method: "GET",
    url: "https://example.com",
  },
  {
    id: "redirect",
    title: "重定向（302）",
    description: "测试重定向场景与最终响应。",
    method: "GET",
    url: "https://httpbin.org/redirect-to?url=https://httpbin.org/get",
  },
  {
    id: "status-404",
    title: "错误状态（404）",
    description: "测试 4xx 状态展示。",
    method: "GET",
    url: "https://httpbin.org/status/404",
  },
  {
    id: "status-500",
    title: "错误状态（500）",
    description: "测试 5xx 状态展示。",
    method: "GET",
    url: "https://httpbin.org/status/500",
  },
  {
    id: "json-get",
    title: "JSON GET",
    description: "基础 JSON 响应解析测试。",
    method: "GET",
    url: "https://httpbin.org/get",
  },
  {
    id: "stream",
    title: "Stream 响应",
    description: "读取 chunked 数据流，前端拼接字符串。",
    method: "GET",
    url: "https://httpbin.org/stream/5",
    stream: true,
  },
  {
    id: "xml-get",
    title: "XML GET",
    description: "测试 text/xml 响应。",
    method: "GET",
    url: "https://httpbin.org/xml",
  },
  {
    id: "html-get",
    title: "HTML GET",
    description: "测试 text/html 响应。",
    method: "GET",
    url: "https://httpbin.org/html",
  },
  {
    id: "image-png",
    title: "图片响应（PNG）",
    description: "测试图片预览。",
    method: "GET",
    url: "https://httpbin.org/image/png",
  },
  {
    id: "bytes-64k",
    title: "二进制响应（64KB）",
    description: "测试二进制/大内容响应。",
    method: "GET",
    url: "https://httpbin.org/bytes/65536",
  },
  {
    id: "gzip",
    title: "压缩响应（gzip）",
    description: "测试压缩响应头与解压内容。",
    method: "GET",
    url: "https://httpbin.org/gzip",
  },
  {
    id: "post-json",
    title: "POST JSON",
    description: "POST application/json 数据。",
    method: "POST",
    url: "https://httpbin.org/post",
    headers: { "Content-Type": "application/json" },
    bodyType: "json",
    body: { message: "hello proxyFetch", count: 1 },
  },
  {
    id: "post-form",
    title: "POST Form",
    description: "POST x-www-form-urlencoded 数据。",
    method: "POST",
    url: "https://httpbin.org/post",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    bodyType: "form",
    body: { from: "proxyFetch", action: "submit" },
  },
  {
    id: "put-json",
    title: "PUT JSON",
    description: "PUT application/json 数据。",
    method: "PUT",
    url: "https://httpbin.org/put",
    headers: { "Content-Type": "application/json" },
    bodyType: "json",
    body: { id: 1, name: "update" },
  },
  {
    id: "patch-json",
    title: "PATCH JSON",
    description: "PATCH application/json 数据。",
    method: "PATCH",
    url: "https://httpbin.org/patch",
    headers: { "Content-Type": "application/json" },
    bodyType: "json",
    body: { flag: true },
  },
  {
    id: "delete",
    title: "DELETE 请求",
    description: "DELETE 语义测试。",
    method: "DELETE",
    url: "https://httpbin.org/delete",
  },
  {
    id: "headers-echo",
    title: "自定义 Header 回显",
    description: "服务端回显请求头。",
    method: "GET",
    url: "https://httpbin.org/headers",
    headers: { "X-Demo-Header": "proxyFetch" },
  },
  {
    id: "cookies-set",
    title: "Set-Cookie",
    description: "测试多条 Set-Cookie 与 Cookie 展示。",
    method: "GET",
    url: "https://httpbin.org/cookies/set?session=abc&token=123",
  },
  {
    id: "basic-auth",
    title: "Basic Auth",
    description: "测试基础认证。",
    method: "GET",
    url: "https://httpbin.org/basic-auth/user/passwd",
    headers: { Authorization: "Basic dXNlcjpwYXNzd2Q=" },
  },
  {
    id: "timeout",
    title: "Timeout",
    description: "模拟超时场景（服务端延迟 > timeout）。",
    method: "GET",
    url: "https://httpbin.org/delay/3",
    timeout: 1000,
  },
  {
    id: "abort",
    title: "Abort",
    description: "手动终止请求。",
    method: "GET",
    url: "https://httpbin.org/delay/5",
    abortable: true,
  },
  {
    id: "invalid-url",
    title: "非法 URL",
    description: "URL 解析失败时的错误返回。",
    method: "GET",
    url: "ht!tp://bad-url",
  },
];

const ProxyFetchDemo: React.FC = () => {
  const [extensionStatus, setExtensionStatus] = useState<
    "checking" | "enabled" | "disabled"
  >("checking");

  const [results, setResults] = useState<Record<string, ResultState>>({});
  const [controllers, setControllers] = useState<
    Record<string, AbortController>
  >({});
  const [networkEntries, setNetworkEntries] = useState<NetworkEntry[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [customUrl, setCustomUrl] = useState("https://httpbin.org/anything");
  const [customMethod, setCustomMethod] = useState("GET");
  const [customHeaders, setCustomHeaders] = useState(
    JSON.stringify({ "Content-Type": "application/json" }, null, 2),
  );
  const [customBodyType, setCustomBodyType] = useState<"json" | "text" | "form">(
    "json",
  );
  const [customBody, setCustomBody] = useState(
    JSON.stringify({ hello: "world" }, null, 2),
  );
  const [customTimeout, setCustomTimeout] = useState("10000");
  const [useNativeFetch, setUseNativeFetch] = useState(false);

  useEffect(() => {
    const check = async () => {
      setExtensionStatus("checking");
      const enabled = await checkPluginEnabled();
      setExtensionStatus(enabled ? "enabled" : "disabled");
    };
    void check();
  }, []);

  const checkExtension = async () => {
    setExtensionStatus("checking");
    const enabled = await checkPluginEnabled();
    setExtensionStatus(enabled ? "enabled" : "disabled");
  };

  const setResult = (id: string, patch: Partial<ResultState>) => {
    setResults((prev) => ({
      ...prev,
      [id]: {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        status: "idle",
        ...prev[id],
        ...patch,
      },
    }));
  };

  const readHeaders = (headers: Headers) =>
    Object.fromEntries(Array.from(headers.entries()));

  const runScenario = async (scenario: Scenario, source: "proxy" | "native") => {
    setResult(scenario.id, { status: "running", source });

    let controller: AbortController | undefined;
    if (scenario.abortable) {
      controller = new AbortController();
      setControllers((prev) => ({ ...prev, [scenario.id]: controller! }));
    }

    const requestId = createRequestId();
    const startTime = Date.now();

    const {
      headers: resolvedHeaders,
      bodySpec,
      bodyInit,
    } = buildBodyPayload(
      scenario.method,
      scenario.bodyType,
      scenario.body,
      scenario.headers ?? {},
    );

    const requestSpec: RequestSpec = {
      url: scenario.url,
      method: scenario.method,
      headers: resolvedHeaders,
      body: bodySpec,
      timeout: scenario.timeout,
    };

    const init: RequestInit & { timeout?: number } = {
      method: scenario.method,
      headers: resolvedHeaders,
      body: bodyInit,
      signal: controller?.signal,
      timeout: scenario.timeout,
    };

    const start = performance.now();

    try {
      const response = useNativeFetch
        ? await fetch(scenario.url, init)
        : await proxyFetch(scenario.url, init);
      const durationMs = Math.round(performance.now() - start);
      const headers = readHeaders(response.headers);
      const contentType = getContentType(headers);
      const setCookies = (response as { setCookies?: string[] }).setCookies;

      const { bodySpec: responseBody, bodyText } =
        await readResponseBody(response, headers, contentType, !!scenario.stream);

      const endTime = Date.now();

      const responseSpec: ResponseSpec = {
        url: ("url" in response && response.url) ? response.url : scenario.url,
        status: response.status,
        statusText: response.statusText,
        headers,
        setCookies,
        body: responseBody,
      };

      const timing: TimingInfo = {
        startTime,
        endTime,
        duration: endTime - startTime,
      };

      const result: ProxyResult = {
        ok: true,
        response: responseSpec,
        timing,
      };

      const entry = mapProxyExchangeToNetworkEntry({
        requestId,
        request: requestSpec,
        result,
      });

      setNetworkEntries((prev) => [entry, ...prev]);
      setResult(scenario.id, {
        status: "success",
        durationMs,
        statusCode: response.status,
        statusText: response.statusText,
        headers,
        bodyText,
      });
    } catch (error: unknown) {
      const durationMs = Math.round(performance.now() - start);
      const isProxyError = error instanceof ProxyError;
      const errorInfo = getErrorInfo(error);
      setResult(scenario.id, {
        status: "error",
        durationMs,
        errorType: isProxyError ? error.type : errorInfo.name ?? "Unknown",
        errorMessage: isProxyError ? error.message : errorInfo.message ?? "Unknown error",
      });

      const endTime = Date.now();
      const timing: TimingInfo = {
        startTime,
        endTime,
        duration: endTime - startTime,
      };
      const errorSpec = toErrorSpec(error);
      const result: ProxyResult = {
        ok: false,
        error: errorSpec,
      };

      const entry = mapProxyExchangeToNetworkEntry(
        {
          requestId,
          request: requestSpec,
          result,
          timing,
        },
        {
          meta: { error },
        },
      );

      setNetworkEntries((prev) => [entry, ...prev]);
    } finally {
      if (scenario.abortable) {
        setControllers((prev) => {
          const next = { ...prev };
          delete next[scenario.id];
          return next;
        });
      }
    }
  };

  const abortScenario = (id: string) => {
    const controller = controllers[id];
    if (controller) {
      controller.abort();
    }
  };

  const pluginAvailable = extensionStatus === "enabled";
  const extensionTag = useMemo(() => {
    if (extensionStatus === "checking") {
      return <Tag color="processing">检测中</Tag>;
    }
    if (extensionStatus === "enabled") {
      return (
        <Tag color="success" icon={<CheckCircleOutlined />}>
          已检测到扩展
        </Tag>
      );
    }
    return (
      <Tag color="error" icon={<CloseCircleOutlined />}>
        未检测到扩展
      </Tag>
    );
  }, [extensionStatus]);

  const runCustom = async () => {
    const scenario: Scenario = {
      id: "custom",
      title: "自定义请求",
      description: "自定义输入执行",
      method: customMethod,
      url: customUrl,
      timeout: Number(customTimeout) || 0,
    };

    let headers: Record<string, string> = {};
    if (customHeaders.trim()) {
      try {
        headers = JSON.parse(customHeaders);
      } catch {
        setResult("custom", {
          status: "error",
          errorType: "INVALID_HEADERS",
          errorMessage: "Headers 不是合法 JSON",
        });
        return;
      }
    }

    let body: Scenario["body"];
    if (customMethod !== "GET" && customBody.trim()) {
      if (customBodyType === "json") {
        try {
          body = JSON.parse(customBody);
        } catch {
          setResult("custom", {
            status: "error",
            errorType: "INVALID_JSON",
            errorMessage: "Body 不是合法 JSON",
          });
          return;
        }
      } else if (customBodyType === "form") {
        body = Object.fromEntries(
          customBody
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [key, ...rest] = line.split("=");
              return [key, rest.join("=")];
            }),
        );
      } else {
        body = customBody;
      }
    }

    await runScenario(
      {
        ...scenario,
        headers,
        bodyType: customBodyType,
        body,
      },
      useNativeFetch ? "native" : (pluginAvailable ? "proxy" : "native"),
    );
  };

  return (
    <div className="proxy-demo-page">
      <div className="proxy-demo-hero">
        <div>
          <Title level={2} className="proxy-demo-title">
            proxyFetch 演示与测试台
          </Title>
          <Paragraph className="proxy-demo-subtitle">
            以 fetch 风格调用，借助扩展实现跨域请求。用于 SDK 演示与多场景测试。
          </Paragraph>
        </div>
        <Space>
          <Button type="primary" disabled={!EXTENSION_URL} href={EXTENSION_URL}>
            安装扩展
          </Button>
          <Button onClick={checkExtension}>重新检测</Button>
        </Space>
      </div>

      <div className="proxy-demo-status">
        <Card className="proxy-demo-toggle">
          <Space>
            <Text strong>请求模式</Text>
            <Switch
              checked={useNativeFetch}
              onChange={setUseNativeFetch}
              checkedChildren="原生 fetch"
              unCheckedChildren="proxyFetch"
            />
            <Text type="secondary">
              {useNativeFetch
                ? "使用浏览器原生 fetch"
                : "使用 proxyFetch（扩展）"}
            </Text>
          </Space>
        </Card>
        {extensionTag}
        {!EXTENSION_URL && (
          <Alert
            type="warning"
            showIcon
            message="未配置扩展安装地址"
            description={
              <span>
                请在 <Text code>ui/.env</Text> 中设置{" "}
                <Text code>VITE_PROXY_EXTENSION_URL</Text>
              </span>
            }
          />
        )}
        {!pluginAvailable && (
          <Alert
            type="info"
            showIcon
            message="扩展未检测到"
            description="安装扩展并刷新页面后再进行测试。"
          />
        )}
      </div>

      <Divider />

      <div className="proxy-demo-section">
        <Title level={4}>快速场景测试</Title>
        <div className="proxy-demo-grid">
          {SCENARIOS.map((scenario) => {
            const result = results[scenario.id];
            const isRunning = result?.status === "running";
            return (
              <Card
                key={scenario.id}
                title={scenario.title}
                className="proxy-demo-card"
                extra={
                  <Space>
                    <Button
                      type="primary"
                      size="small"
                      loading={isRunning}
                      onClick={() =>
                        runScenario(
                          scenario,
                          useNativeFetch ? "native" : (pluginAvailable ? "proxy" : "native"),
                        )
                      }
                    >
                      Run
                    </Button>
                    {scenario.abortable && (
                      <Button
                        size="small"
                        disabled={!controllers[scenario.id]}
                        onClick={() => abortScenario(scenario.id)}
                      >
                        Abort
                      </Button>
                    )}
                  </Space>
                }
              >
                <Paragraph className="proxy-demo-desc">
                  {scenario.description}
                </Paragraph>
                <Paragraph className="proxy-demo-meta">
                  <Text code>{scenario.method}</Text>
                  <Text className="proxy-demo-url">{scenario.url}</Text>
                </Paragraph>
                {scenario.timeout && (
                  <Paragraph className="proxy-demo-meta">
                    timeout: <Text code>{scenario.timeout}ms</Text>
                  </Paragraph>
                )}
                {result && (
                  <div className="proxy-demo-result">
                    {result.status === "success" ? (
                      <>
                        <Space size="small">
                          <Tag color="success">成功</Tag>
                          {result.source && (
                            <Tag color="default">
                              {result.source === "proxy" ? "proxy" : "native"}
                            </Tag>
                          )}
                        </Space>
                        <Text>
                          {result.statusCode} {result.statusText}
                        </Text>
                        <Text type="secondary">
                          {result.durationMs}ms
                        </Text>
                        <pre className="proxy-demo-pre">
                          {result.bodyText}
                        </pre>
                      </>
                    ) : result.status === "error" ? (
                      <>
                        <Space size="small">
                          <Tag color="error">失败</Tag>
                          {result.source && (
                            <Tag color="default">
                              {result.source === "proxy" ? "proxy" : "native"}
                            </Tag>
                          )}
                        </Space>
                        <Text type="danger">
                          {result.errorType}: {result.errorMessage}
                        </Text>
                        <Text type="secondary">
                          {result.durationMs}ms
                        </Text>
                      </>
                    ) : null}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <Divider />

      <div className="proxy-demo-section">
        <Title level={4}>自定义请求</Title>
        <Card className="proxy-demo-card">
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Input
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="URL"
            />
            <Space className="proxy-demo-row">
              <Select
                value={customMethod}
                onChange={setCustomMethod}
                options={["GET", "POST", "PUT", "PATCH", "DELETE"].map(
                  (value) => ({ value }),
                )}
                style={{ width: 140 }}
              />
              <Select
                value={customBodyType}
                onChange={(value) =>
                  setCustomBodyType(value as "json" | "text" | "form")
                }
                options={[
                  { value: "json", label: "JSON" },
                  { value: "form", label: "Form" },
                  { value: "text", label: "Text" },
                ]}
                style={{ width: 140 }}
              />
              <Input
                value={customTimeout}
                onChange={(e) => setCustomTimeout(e.target.value)}
                placeholder="timeout(ms)"
                style={{ width: 140 }}
              />
              <Button type="primary" onClick={runCustom}>
                Run
              </Button>
            </Space>
            <div className="proxy-demo-row">
              <div className="proxy-demo-block">
                <Text strong>Headers (JSON)</Text>
                <Input.TextArea
                  rows={6}
                  value={customHeaders}
                  onChange={(e) => setCustomHeaders(e.target.value)}
                />
              </div>
              <div className="proxy-demo-block">
                <Text strong>
                  Body ({customBodyType === "form" ? "key=value per line" : "raw"})
                </Text>
                <Input.TextArea
                  rows={6}
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                />
              </div>
            </div>
            {results["custom"] && (
              <div className="proxy-demo-result">
                {results["custom"]?.status === "success" ? (
                  <>
                    <Space size="small">
                      <Tag color="success">成功</Tag>
                      {results["custom"]?.source && (
                        <Tag color="default">
                          {results["custom"]?.source === "proxy"
                            ? "proxy"
                            : "native"}
                        </Tag>
                      )}
                    </Space>
                    <Text>
                      {results["custom"]?.statusCode}{" "}
                      {results["custom"]?.statusText}
                    </Text>
                    <Text type="secondary">
                      {results["custom"]?.durationMs}ms
                    </Text>
                    <pre className="proxy-demo-pre">
                      {results["custom"]?.bodyText}
                    </pre>
                  </>
                ) : results["custom"]?.status === "error" ? (
                  <>
                    <Space size="small">
                      <Tag color="error">失败</Tag>
                      {results["custom"]?.source && (
                        <Tag color="default">
                          {results["custom"]?.source === "proxy"
                            ? "proxy"
                            : "native"}
                        </Tag>
                      )}
                    </Space>
                    <Text type="danger">
                      {results["custom"]?.errorType}:{" "}
                      {results["custom"]?.errorMessage}
                    </Text>
                  </>
                ) : null}
              </div>
            )}
          </Space>
        </Card>
      </div>

      <div className="proxy-demo-fab">
        <Badge count={networkEntries.length} size="small">
          <Button
            type="primary"
            shape="circle"
            size="large"
            icon={<BarsOutlined />}
            onClick={() => setDrawerOpen(true)}
          />
        </Badge>
      </div>

      <Drawer
        title="Network 请求"
        placement="right"
        size={980}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        className="proxy-demo-drawer"
      >
        <NetworkViewer
          entries={networkEntries}
          onClear={() => setNetworkEntries([])}
        />
      </Drawer>
    </div>
  );
};

export default ProxyFetchDemo;

function buildBodyPayload(
  method: string,
  bodyType: Scenario["bodyType"],
  body: Scenario["body"],
  headers: Record<string, string>,
): {
  headers: Record<string, string>;
  bodySpec?: RequestBody;
  bodyInit?: BodyInit;
} {
  if (method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD") {
    return { headers };
  }

  if (!bodyType) {
    return { headers };
  }

  const nextHeaders = { ...headers };

  if (bodyType === "json") {
    if (!hasHeader(nextHeaders, "content-type")) {
      nextHeaders["Content-Type"] = "application/json";
    }
    return {
      headers: nextHeaders,
      bodySpec: {
        type: "json",
        value: body ?? {},
      },
      bodyInit: JSON.stringify(body ?? {}),
    };
  }

  if (bodyType === "form") {
    const form = normalizeFormBody(body);
    if (!hasHeader(nextHeaders, "content-type")) {
      nextHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    }
    return {
      headers: nextHeaders,
      bodySpec: {
        type: "form",
        value: form,
      },
      bodyInit: new URLSearchParams(form).toString(),
    };
  }

  if (bodyType === "text") {
    if (!hasHeader(nextHeaders, "content-type")) {
      nextHeaders["Content-Type"] = "text/plain";
    }
    return {
      headers: nextHeaders,
      bodySpec: {
        type: "text",
        value: String(body ?? ""),
      },
      bodyInit: String(body ?? ""),
    };
  }

  return { headers: nextHeaders };
}

function normalizeFormBody(body: Scenario["body"]): Record<string, string> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([key, value]) => [
      key,
      value === null || value === undefined ? "" : String(value),
    ]),
  );
}

async function readResponseBody(
  response: Response | { text: () => Promise<string> },
  headers: Record<string, string>,
  contentType: string,
  preferStream: boolean,
): Promise<{ bodySpec: ResponseSpec["body"]; bodyText: string }> {
  if (isImageContentType(contentType)) {
    const base64 = await readResponseAsBase64(response);
    return {
      bodySpec: {
        type: "base64",
        value: base64,
        mimeType: contentType,
      },
      bodyText: `[image] ${base64.slice(0, 120)}...`,
    };
  }

  let text = "";
  if (preferStream && hasReadableStream(response)) {
    text = await readResponseStream(response);
  } else {
    text = await response.text();
  }
  return {
    bodySpec: parseResponseBody(text, headers),
    bodyText: text,
  };
}

function parseResponseBody(
  bodyText: string,
  headers: Record<string, string>,
): ResponseSpec["body"] {
  const contentType = getContentType(headers);
  const shouldParseJson = contentType.includes("json");

  if (shouldParseJson) {
    const parsed = safeJsonParse(bodyText);
    if (parsed.success) {
      return { type: "json", value: parsed.value };
    }
  }

  const parsed = safeJsonParse(bodyText);
  if (parsed.success) {
    return { type: "json", value: parsed.value };
  }

  return { type: "text", value: bodyText };
}

function safeJsonParse(text: string): { success: true; value: unknown } | { success: false } {
  if (!text) return { success: false };
  try {
    return { success: true, value: JSON.parse(text) };
  } catch {
    return { success: false };
  }
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

function getContentType(headers: Record<string, string>): string {
  return (
    headers["content-type"] ||
    headers["Content-Type"] ||
    headers["CONTENT-TYPE"] ||
    ""
  );
}

function isImageContentType(contentType: string) {
  return contentType.toLowerCase().startsWith("image/");
}

async function readResponseAsBase64(
  response: Response | { text: () => Promise<string> },
): Promise<string> {
  const anyResponse = response as {
    arrayBuffer?: () => Promise<ArrayBuffer>;
    text: () => Promise<string>;
  };

  if (typeof anyResponse.arrayBuffer === "function") {
    const buffer = await anyResponse.arrayBuffer();
    return arrayBufferToBase64(buffer);
  }

  return anyResponse.text();
}

function hasReadableStream(
  response: Response | { text: () => Promise<string> },
): response is Response {
  return typeof (response as Response).body !== "undefined";
}

function getErrorInfo(error: unknown): { name?: string; message?: string } {
  if (!error || typeof error !== "object") return {};
  const maybeError = error as { name?: unknown; message?: unknown };
  return {
    name: typeof maybeError.name === "string" ? maybeError.name : undefined,
    message: typeof maybeError.message === "string" ? maybeError.message : undefined,
  };
}

async function readResponseStream(response: Response): Promise<string> {
  if (!response.body) {
    return response.text();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let done = false;
  let result = "";

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      result += decoder.decode(value, { stream: !done });
    }
  }

  return result;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toErrorSpec(error: unknown): ErrorSpec {
  if (error instanceof ProxyError) {
    return error.original;
  }

  if (error && typeof error === "object") {
    const name = (error as { name?: string }).name;
    if (name === "AbortError") {
      return {
        type: "TIMEOUT",
        message: "The operation was aborted.",
      };
    }
  }

  if (error instanceof TypeError) {
    const message = error.message || "Network error";
    if (message.toLowerCase().includes("invalid url")) {
      return { type: "INVALID_URL", message };
    }
    return { type: "NETWORK_ERROR", message };
  }

  const message =
    (error as { message?: string })?.message ?? "Unknown error";
  return {
    type: "UNKNOWN",
    message,
  };
}
