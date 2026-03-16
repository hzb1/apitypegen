import "./ApiInfo.css";
import CodeCard from "../code-card/CodeCard.tsx";
import type { ApiDetail } from "../../../types.ts";
import Method from "../ui/Method/Method.tsx";
import { useMemo, useState } from "react";
import copyToClipboard from "../../utils/copyToClipboard/copyToClipboard.ts";
import { CopyOutlined } from "@ant-design/icons";
import { message, Tooltip } from "antd";

type ApiInfoProps = {
  api: ApiDetail;
  apiBaseUrl?: string;
  codeMap?: {
    Models: string;
    "Query Params": string;
    "Request Body": string;
    "Response Data": string;
  };
};

const ApiInfo = ({ api, apiBaseUrl, codeMap }: ApiInfoProps) => {
  const title = api?.operation?.summary;
  const description = api?.operation?.description?.trim();
  const tags = api?.operation?.tags ?? [];
  const parameters = api?.operation?.parameters ?? [];
  const hasRequestBody = Boolean(
    (api?.operation as Record<string, unknown> | undefined)?.requestBody,
  );
  const responses = Object.keys(api?.operation?.responses ?? {});
  const operationId = api?.operation?.operationId;
  const isDeprecated = Boolean(api?.operation?.deprecated);
  const groupName = tags[0] || "Default";
  const interfaceName = title || api.path;
  const fullApiPath = useMemo(() => {
    if (!apiBaseUrl) return api.path;
    try {
      const normalizedBase = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
      return new URL(api.path, normalizedBase).toString();
    } catch {
      const normalizedBase = apiBaseUrl.replace(/\/+$/, "");
      const normalizedPath = api.path.startsWith("/") ? api.path : `/${api.path}`;
      return `${normalizedBase}${normalizedPath}`;
    }
  }, [api.path, apiBaseUrl]);
  const [showSecondaryDetails, setShowSecondaryDetails] = useState(false);

  const codeSections = useMemo(() => ([
    {key: "query", title: "Query Params", code: codeMap?.["Query Params"]},
    {key: "body", title: "Request Body", code: codeMap?.["Request Body"]},
    {key: "response", title: "Response Data", code: codeMap?.["Response Data"]},
  ]), [codeMap]);

  const handleCopyFullPath = async () => {
    const copied = await copyToClipboard(fullApiPath);
    if (copied) {
      message.success("已复制完整接口 URL");
      return;
    }
    message.error("复制失败，请重试");
  };

  return (
    <div className="api-doc">
      <header className="api-doc-header">
        <div className="api-doc-breadcrumb">
          <span className="api-doc-breadcrumb-group" title={groupName}>{groupName}</span>
          <span className="api-doc-breadcrumb-sep">&gt;</span>
          <span className="api-doc-breadcrumb-name" title={interfaceName}>{interfaceName}</span>
        </div>

        <div className="api-doc-full-path" title={fullApiPath}>
          <span className="api-doc-full-path-text">{fullApiPath}</span>
          <Tooltip title="复制完整接口 URL">
            <button
              type="button"
              className="api-doc-full-path-copy"
              onClick={() => {
                void handleCopyFullPath();
              }}
            >
              <CopyOutlined />
            </button>
          </Tooltip>
        </div>

        <div className="api-doc-title-row">
          <Method method={api.method} isActive />
          <code className="api-doc-title-path" title={api.path}>{api.path}</code>
          <h1 title={title || api.path}>{title || api.path}</h1>
        </div>
        {description ? <p className="api-doc-description">{description}</p> : null}

        <div className="api-doc-stats-inline">
          <span>参数 {parameters.length}</span>
          <span>请求体 {hasRequestBody ? "有" : "无"}</span>
          <span>响应码 {responses.length || 0}</span>
          <button
            type="button"
            className="api-doc-secondary-toggle"
            onClick={() => setShowSecondaryDetails((prev) => !prev)}
          >
            {showSecondaryDetails ? "收起详情" : "展开详情"}
          </button>
        </div>

        <div className={`api-doc-secondary ${showSecondaryDetails ? "is-open" : ""}`}>
          <div className="api-doc-secondary-meta">
            {operationId ? (
              <span className="api-doc-chip">operationId: {operationId}</span>
            ) : null}
            {tags.map((tag) => (
              <span key={tag} className="api-doc-chip tag">{tag}</span>
            ))}
            {isDeprecated ? <span className="api-doc-chip warning">Deprecated</span> : null}
          </div>
          <div className="api-doc-response-list">
            {responses.map((statusCode) => (
              <span key={statusCode} className="api-doc-response-item">
                {statusCode}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="api-doc-cards">
        {codeSections.map((section) => (
          <CodeCard
            key={section.key}
            title={section.title}
            code={section.code}
            styles={{body: {height: 220}}}
          />
        ))}
      </div>
    </div>
  );
};

export default ApiInfo;
