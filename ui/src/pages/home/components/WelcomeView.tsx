import { useState } from "react";
import type { AutoCompleteProps } from "antd";
import { AutoComplete, Button, Input, Tag } from "antd";
import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import logoUrl from "@/assets/logo/logo-replica-full.svg";
import { EXTENSION_URL } from "../home.constants.ts";
import type { LoadingFeedback } from "../home.types.ts";
import type { SavedApiExport } from "../export/export.types.ts";
import type { PluginStatus } from "@/hooks/usePluginEnabled.ts";
import LocalApiLibrary from "./LocalApiLibrary.tsx";

type WelcomeViewProps = {
  autoCompleteOptions: AutoCompleteProps["options"];
  handleCommitIp: (value: string) => void;
  handleTryDemo: () => void;
  loading: boolean;
  loadingFeedback: LoadingFeedback;
  checking: boolean;
  pluginStatus: PluginStatus;
  pluginEnabled: boolean;
  onRecheckPlugin: () => void;
  savedExports: SavedApiExport[];
  localLibraryLoading: boolean;
  localLibraryError?: string | null;
  onOpenLocalExport: (id: string) => void;
  onDownloadLocalExport: (record: SavedApiExport) => void;
  onDeleteLocalExport: (id: string) => void;
};

export default function WelcomeView(props: WelcomeViewProps) {
  const {
    autoCompleteOptions,
    handleCommitIp,
    handleTryDemo,
    loading,
    loadingFeedback,
    checking,
    pluginStatus,
    pluginEnabled,
    onRecheckPlugin,
    savedExports,
    localLibraryLoading,
    localLibraryError,
    onOpenLocalExport,
    onDownloadLocalExport,
    onDeleteLocalExport,
  } = props;
  const [docInput, setDocInput] = useState("");

  return (
    <div className="home-welcome">
      <div className="home-welcome-card">
        <img src={logoUrl} alt="TS Swagger" className="home-welcome-logo" />
        <div className="home-welcome-title">TS Swagger</div>
        <div className="home-welcome-subtitle">
          开发者文档门户 · API 社区体验
        </div>
        <div className="home-welcome-hint">
          输入 Swagger/OpenAPI 文档 URL，快速生成可搜索、可调试、可复制代码的文档界面
        </div>
        <div className="home-welcome-demo-copy">
          示例项目无需安装浏览器扩展，可直接体验接口浏览、搜索与 TypeScript 类型生成。
        </div>
        <button
          type="button"
          className="home-welcome-demo-button"
          onClick={handleTryDemo}
        >
          试用示例项目
        </button>
        <div className="home-welcome-search">
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
                placeholder="输入服务地址或 OpenAPI 文档 URL，例如：http://localhost:9966/v3/api-docs"
                onPressEnter={(event) => handleCommitIp(event.currentTarget.value)}
              />
            </AutoComplete>
            <button
              type="button"
              className="welcome-load-button"
              onClick={() => handleCommitIp(docInput)}
              disabled={!docInput.trim() || loading}
            >
              {loading ? loadingFeedback.button : "开始探索"}
            </button>
          </div>
        </div>
        <Button
          className="home-welcome-download"
          type="link"
          icon={<DownloadOutlined />}
          href={EXTENSION_URL}
        >
          下载最新浏览器扩展
        </Button>
      </div>

      {!pluginEnabled && (
        <section className="extension-guide">
          <div className="extension-guide-header">
            <div>
              <h2>未安装扩展也可以先体验</h2>
              <p>TS Swagger 的核心浏览和类型生成不强制依赖扩展；只有跨域、内网和代理调试场景需要它。</p>
            </div>
            <Tag color={pluginStatus === "checking" ? "processing" : "warning"}>
              {checking ? "正在检测扩展" : "未检测到扩展"}
            </Tag>
          </div>
          <div className="extension-guide-grid">
            <div className="extension-guide-panel">
              <h3>无扩展可用</h3>
              <ul>
                <li>试用示例项目</li>
                <li>加载同源或允许 CORS 的 OpenAPI 文档</li>
                <li>浏览接口、搜索接口、复制 TypeScript 类型</li>
                <li>打开本地接口库、保存到本地、导出 JSON</li>
              </ul>
            </div>
            <div className="extension-guide-panel">
              <h3>需要扩展</h3>
              <ul>
                <li>加载内网 Swagger 地址</li>
                <li>加载被 CORS 限制的跨域文档</li>
                <li>代理真实接口请求</li>
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

      <LocalApiLibrary
        savedExports={savedExports}
        loading={localLibraryLoading}
        error={localLibraryError}
        onOpen={onOpenLocalExport}
        onDownload={onDownloadLocalExport}
        onDelete={onDeleteLocalExport}
      />
    </div>
  );
}
