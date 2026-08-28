import type { ReactNode } from "react";
import type { AutoCompleteProps } from "antd";
import { AutoComplete, Button, Input, Select, Tooltip } from "antd";
import { MenuOutlined, QuestionCircleOutlined, SettingOutlined } from "@ant-design/icons";
import ThemeDropdown from "@/components/theme/ThemeDropdown.tsx";
import logoUrl from "@/assets/logo/logo-full.svg";
import type { LoadingFeedback } from "../home.types.ts";
import DocumentStatusChip, { type DocumentMode } from "./DocumentStatusChip.tsx";

type ServiceOption = {
  label: string;
  value: string;
};

type DocumentTopbarProps = {
  documentMeta: {
    title: string;
    subtitle?: string;
    mode: DocumentMode;
    saved: boolean;
    serviceStatusText?: string;
    serviceStatusKind?: "loading" | "ready" | "error";
  };
  inputIp: string;
  setInputIp: (value: string) => void;
  autoCompleteOptions: AutoCompleteProps["options"];
  handleCommitIp: (value: string) => void;
  loading: boolean;
  loadingFeedback: LoadingFeedback;
  serviceUrl?: string;
  configLoading: boolean;
  serviceOptions: ServiceOption[];
  handleServiceChange: (url?: string) => void;
  setMobileNavOpen: (open: boolean) => void;
  setConfigDrawerOpen: (open: boolean) => void;
  extraActions?: ReactNode;
};

export default function DocumentTopbar(props: DocumentTopbarProps) {
  const {
    inputIp,
    setInputIp,
    autoCompleteOptions,
    handleCommitIp,
    loading,
    loadingFeedback,
    serviceUrl,
    configLoading,
    serviceOptions,
    handleServiceChange,
    setMobileNavOpen,
    setConfigDrawerOpen,
    extraActions,
    documentMeta,
  } = props;
  const showServiceSelect = serviceOptions.length > 1;

  return (
    <header className="home-topbar">
      <div className="home-topbar-brand">
        <button
          type="button"
          className="mobile-nav-trigger"
          onClick={() => setMobileNavOpen(true)}
        >
          <MenuOutlined />
        </button>
        <img src={logoUrl} alt="APITypeGen" className="home-topbar-logo" />
        <div className="home-topbar-copy">
          <div className="home-topbar-title-row">
            <div className="home-topbar-title" title={documentMeta.title}>
              {documentMeta.title}
            </div>
            <DocumentStatusChip
              mode={documentMeta.mode}
              saved={documentMeta.saved}
              serviceStatusText={documentMeta.serviceStatusText}
              serviceStatusKind={documentMeta.serviceStatusKind}
            />
          </div>
          <div className="home-topbar-subtitle" title={documentMeta.subtitle}>
            {documentMeta.subtitle || "TypeScript 类型生成"}
          </div>
        </div>
      </div>
      <div className="home-topbar-actions">
        <div className={`home-field-wrap ${showServiceSelect ? "" : "is-single"}`}>
          <div className="field-row">
            <div className="field-label">
              <span>文档地址</span>
              <Tooltip title="支持服务地址（自动探测）或可直接 GET 的 OpenAPI/Swagger 文档 URL">
                <QuestionCircleOutlined className="field-help-icon" />
              </Tooltip>
            </div>
            <div className="field-control">
              <div className="doc-address-composer">
                <AutoComplete
                  className="doc-address-auto"
                  value={inputIp}
                  onChange={setInputIp}
                  onSelect={handleCommitIp}
                  options={autoCompleteOptions}
                >
                  <Input
                    placeholder="输入服务地址或 OpenAPI 文档 URL"
                    onPressEnter={(event) => handleCommitIp(event.currentTarget.value)}
                  />
                </AutoComplete>
                <button
                  type="button"
                  className="doc-load-button"
                  onClick={() => handleCommitIp(inputIp)}
                  disabled={!inputIp.trim() || loading}
                >
                  {loading ? loadingFeedback.button : "加载文档"}
                </button>
              </div>
            </div>
          </div>
          {showServiceSelect ? (
            <div className="field-row">
              <div className="field-label">
                <span>服务</span>
                <Tooltip title="当 swagger-config 返回多个服务时，在这里切换具体文档">
                  <QuestionCircleOutlined className="field-help-icon" />
                </Tooltip>
              </div>
              <div className="field-control">
                <Select
                  value={serviceUrl}
                  loading={configLoading}
                  onChange={handleServiceChange}
                  options={serviceOptions}
                  placeholder="选择服务"
                  style={{minWidth: "160px"}}
                />
              </div>
            </div>
          ) : null}
        </div>
        <div className="home-topbar-tools">
          {extraActions}
          <Tooltip title="项目配置">
            <Button
              className="topbar-icon-button"
              type="default"
              icon={<SettingOutlined />}
              aria-label="项目配置"
              onClick={() => setConfigDrawerOpen(true)}
            />
          </Tooltip>
          <ThemeDropdown />
        </div>
      </div>
    </header>
  );
}
