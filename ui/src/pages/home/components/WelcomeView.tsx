import { useState } from "react";
import type { AutoCompleteProps } from "antd";
import { AutoComplete, Button, Input, Tag } from "antd";
import {
  ApiOutlined,
  BugOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import logoUrl from "@/assets/logo/logo-full.svg";
import { EXTENSION_URL } from "../home.constants.ts";
import type { LoadingFeedback } from "../home.types.ts";
import type { PluginStatus } from "@/hooks/usePluginEnabled.ts";

type WelcomeViewProps = {
  autoCompleteOptions: AutoCompleteProps["options"];
  handleCommitIp: (value: string) => void;
  handleTryDemo: () => void;
  handleTryMultiServiceDemo: () => void;
  loading: boolean;
  loadingFeedback: LoadingFeedback;
  checking: boolean;
  pluginStatus: PluginStatus;
  pluginEnabled: boolean;
  onRecheckPlugin: () => void;
  localLibraryCount: number;
};

export default function WelcomeView(props: WelcomeViewProps) {
  const {
    autoCompleteOptions,
    handleCommitIp,
    handleTryDemo,
    handleTryMultiServiceDemo,
    loading,
    loadingFeedback,
    checking,
    pluginStatus,
    pluginEnabled,
    onRecheckPlugin,
    localLibraryCount,
  } = props;
  const [docInput, setDocInput] = useState("");
  const extensionText = checking
    ? "扩展检测中"
    : pluginEnabled
      ? "扩展已连接"
      : "原生模式";

  return (
    <div className="home-welcome">
      <section className="home-welcome-shell">
        <div className="home-welcome-copy">
          <div className="home-welcome-brandline">
            <img src={logoUrl} alt="APITypeGen" className="home-welcome-logo" />
            <Tag color={pluginEnabled ? "success" : "processing"}>{extensionText}</Tag>
          </div>
          <h1 className="home-welcome-title">从 API 文档生成可靠的 TypeScript 类型</h1>
          <p className="home-welcome-subtitle">
            从 Swagger/OpenAPI 进入可检索的 API 视图，保留类型生成、本地库和调试入口。
          </p>

          <div className="home-welcome-composer-panel">
            <div className="home-welcome-composer-head">
              <span>文档入口</span>
              <button type="button" className="home-welcome-inline-action" onClick={handleTryDemo}>
                <ThunderboltOutlined />
                <span>示例项目</span>
              </button>
              <button type="button" className="home-welcome-inline-action" onClick={handleTryMultiServiceDemo}>
                <ApiOutlined />
                <span>多服务示例</span>
              </button>
            </div>
            <div className="home-welcome-composer">
              <AutoComplete
                className="home-welcome-auto"
                value={docInput}
                onChange={(value) => setDocInput(value)}
                onSelect={handleCommitIp}
                options={autoCompleteOptions}
              >
                <Input
                  size="large"
                  placeholder="http://localhost:9966/v3/api-docs"
                  onPressEnter={(event) => handleCommitIp(event.currentTarget.value)}
                />
              </AutoComplete>
              <button
                type="button"
                className="welcome-load-button"
                onClick={() => handleCommitIp(docInput)}
                disabled={!docInput.trim() || loading}
              >
                {loading ? loadingFeedback.button : "加载文档"}
              </button>
            </div>
          </div>

          <div className="home-welcome-actions">
            <button
              type="button"
              className="home-welcome-demo-button"
              onClick={handleTryDemo}
            >
              <ThunderboltOutlined />
              <span>试用示例项目</span>
            </button>
            <button
              type="button"
              className="home-welcome-demo-button"
              onClick={handleTryMultiServiceDemo}
            >
              <ApiOutlined />
              <span>多服务示例</span>
            </button>
            <Button
              className="home-welcome-download"
              icon={<DownloadOutlined />}
              href={EXTENSION_URL}
            >
              浏览器扩展
            </Button>
            <Button
              className="home-welcome-download"
              icon={<BugOutlined />}
              href="/glitchtip"
            >
              GlitchTip 调试
            </Button>
          </div>

          <div className="home-welcome-status-grid">
            <div className="home-welcome-status-item">
              <ApiOutlined />
              <strong>OpenAPI v2/v3</strong>
              <span>文档解析</span>
            </div>
            <div className="home-welcome-status-item">
              <CodeOutlined />
              <strong>TypeScript</strong>
              <span>复制即用</span>
            </div>
            <div className="home-welcome-status-item">
              <DatabaseOutlined />
              <strong>{localLibraryCount}</strong>
              <span>本地文档</span>
            </div>
          </div>
        </div>

        <div className="home-product-preview" aria-label="APITypeGen 工作台预览">
          <div className="home-product-preview-bar">
            <span />
            <span />
            <span />
            <strong>api/showcase</strong>
          </div>
          <div className="home-product-preview-body">
            <div className="home-product-preview-nav">
              <div className="preview-nav-title">用户服务</div>
              <div className="preview-nav-item is-active">
                <span className="method-tag method-tag-get active">GET</span>
                <div>
                  <strong>查询用户列表</strong>
                  <small>/api/users</small>
                </div>
              </div>
              <div className="preview-nav-item">
                <span className="method-tag method-tag-post">POST</span>
                <div>
                  <strong>创建用户</strong>
                  <small>/api/users</small>
                </div>
              </div>
              <div className="preview-nav-item">
                <span className="method-tag method-tag-delete">DEL</span>
                <div>
                  <strong>删除用户</strong>
                  <small>/api/users/{`{id}`}</small>
                </div>
              </div>
            </div>
            <div className="home-product-preview-main">
              <div className="preview-endpoint-head">
                <span className="method-tag method-tag-get active">GET</span>
                <strong>查询用户列表</strong>
              </div>
              <div className="preview-endpoint-path">https://api.demo.local/api/users</div>
              <div className="preview-code-card">
                <div className="preview-code-title">Response Data</div>
                <pre>{`type User = {
  id: string;
  name: string;
  roles: string[];
};`}</pre>
              </div>
              <div className="preview-metric-row">
                <span>42 APIs</span>
                <span>7 Models</span>
                <span>JSON Ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!pluginEnabled && (
        <section className="extension-guide">
          <div className="extension-guide-header">
            <div>
              <h2>当前使用原生模式</h2>
              <p>同源文档、Demo 和本地接口库可直接打开；跨域、内网和代理调试需要浏览器扩展。</p>
            </div>
            <Tag color={pluginStatus === "checking" ? "processing" : "warning"}>
              {checking ? "正在检测扩展" : "未检测到扩展"}
            </Tag>
          </div>
          <div className="extension-guide-grid">
            <div className="extension-guide-panel">
              <SafetyCertificateOutlined />
              <h3>原生可用</h3>
              <ul>
                <li>试用示例项目</li>
                <li>加载同源或允许 CORS 的 OpenAPI 文档</li>
                <li>打开本地接口库、保存到本地</li>
              </ul>
            </div>
            <div className="extension-guide-panel">
              <DownloadOutlined />
              <h3>扩展增强</h3>
              <ul>
                <li>加载内网 Swagger 地址</li>
                <li>加载被 CORS 限制的跨域文档</li>
                <li>使用网络调试面板的 proxyFetch 模式</li>
              </ul>
            </div>
          </div>
          <div className="extension-guide-actions">
            <Button type="primary" onClick={handleTryDemo}>
              试用示例项目
            </Button>
            <Button icon={<DownloadOutlined />} href={EXTENSION_URL}>
              下载扩展
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={checking}
              onClick={onRecheckPlugin}
            >
              重新检测
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
