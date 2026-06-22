import type { AutoCompleteProps } from "antd";
import { Alert, AutoComplete, Button, Input } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import logoUrl from "@/assets/logo/logo-replica-full.svg";
import { DEFAULT_DOC_URL, EXTENSION_URL } from "../home.constants.ts";
import type { LoadingFeedback } from "../home.types.ts";

type WelcomeViewProps = {
  inputIp: string;
  setInputIp: (value: string) => void;
  autoCompleteOptions: AutoCompleteProps["options"];
  handleCommitIp: (value: string) => void;
  handleTryDemo: () => void;
  loading: boolean;
  loadingFeedback: LoadingFeedback;
  checking: boolean;
  pluginEnabled: boolean;
};

export default function WelcomeView(props: WelcomeViewProps) {
  const {
    inputIp,
    setInputIp,
    autoCompleteOptions,
    handleCommitIp,
    handleTryDemo,
    loading,
    loadingFeedback,
    checking,
    pluginEnabled,
  } = props;

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
              value={inputIp}
              onChange={(value) => setInputIp(value)}
              onSelect={handleCommitIp}
              options={autoCompleteOptions}
            >
              <Input
                size="large"
                placeholder={DEFAULT_DOC_URL}
                onPressEnter={(event) => handleCommitIp(event.currentTarget.value)}
              />
            </AutoComplete>
            <button
              type="button"
              className="welcome-load-button"
              onClick={() => handleCommitIp(inputIp)}
              disabled={!inputIp.trim() || loading}
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

      {!checking && !pluginEnabled && (
        <Alert
          type="warning"
          showIcon
          title="未检测到浏览器扩展"
          description={
            <div className="home-welcome-steps">
              <div>示例项目无需扩展；加载内网/跨域 Swagger、代理真实请求和网络调试时需要扩展。</div>
              <div>安装步骤：</div>
              <ol>
                <li>1.点击“安装扩展”下载压缩包。</li>
                <li>2.解压后打开浏览器扩展管理页。</li>
                <li>3.开启“开发者模式”，选择“加载已解压的扩展”。</li>
              </ol>
            </div>
          }
          action={
            <Button size="small" type="primary" href={EXTENSION_URL}>
              下载最新扩展
            </Button>
          }
          className="home-welcome-alert"
        />
      )}
    </div>
  );
}
