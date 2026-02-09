import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Divider,
  Input,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { proxyFetch, checkPluginEnabled } from "@extension/src/shared/proxySdk.ts";
import { ProxyError } from "@extension/src/shared/types.ts";
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
  body?: any;
  timeout?: number;
  abortable?: boolean;
};

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
    id: "json-get",
    title: "JSON GET",
    description: "基础 JSON 响应解析测试。",
    method: "GET",
    url: "https://httpbin.org/get",
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

    const init: RequestInit & { timeout?: number } = {
      method: scenario.method,
      headers: scenario.headers,
      signal: controller?.signal,
      timeout: scenario.timeout,
    };

    if (scenario.bodyType === "json") {
      init.body = JSON.stringify(scenario.body ?? {});
    } else if (scenario.bodyType === "form") {
      init.body = new URLSearchParams(scenario.body ?? {}).toString();
    } else if (scenario.bodyType === "text") {
      init.body = String(scenario.body ?? "");
    }

    const start = performance.now();

    try {
      const response = await proxyFetch(scenario.url, init);
      const bodyText = await response.text();
      const durationMs = Math.round(performance.now() - start);
      setResult(scenario.id, {
        status: "success",
        durationMs,
        statusCode: response.status,
        statusText: response.statusText,
        headers: readHeaders(response.headers),
        bodyText,
      });
    } catch (error: any) {
      const durationMs = Math.round(performance.now() - start);
      const isProxyError = error instanceof ProxyError;
      setResult(scenario.id, {
        status: "error",
        durationMs,
        errorType: isProxyError ? error.type : error?.name ?? "Unknown",
        errorMessage: error?.message ?? "Unknown error",
      });
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
      } catch (error: any) {
        setResult("custom", {
          status: "error",
          errorType: "INVALID_HEADERS",
          errorMessage: "Headers 不是合法 JSON",
        });
        return;
      }
    }

    let body: any = undefined;
    if (customMethod !== "GET" && customBody.trim()) {
      if (customBodyType === "json") {
        try {
          body = JSON.parse(customBody);
        } catch (error: any) {
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
      pluginAvailable ? "proxy" : "native",
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
                          pluginAvailable ? "proxy" : "native",
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
                        <Tag color="success">成功</Tag>
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
                        <Tag color="error">失败</Tag>
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
                    <Tag color="success">成功</Tag>
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
                    <Tag color="error">失败</Tag>
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
    </div>
  );
};

export default ProxyFetchDemo;
