import "./ApiInfo.css";
import { CopyOutlined } from "@ant-design/icons";
import { message, Tooltip } from "antd";
import { useMemo } from "react";
import type { OpenAPI } from "openapi-types";
import type { ApiDetail } from "../../../types.ts";
import copyToClipboard from "../../utils/copyToClipboard/copyToClipboard.ts";
import CodeCard from "../code-card/CodeCard.tsx";
import Method from "../ui/Method/Method.tsx";
import type { TsCodeParts } from "@/pages/home/home.types.ts";
import ResponseTabs from "./ResponseTabs.tsx";

/** 接口详情连续展示区的输入。 */
type ApiInfoProps = {
  /** 当前查看的接口。 */
  api: ApiDetail;
  /** 接口基础地址。 */
  apiBaseUrl?: string;
  /** 当前 OpenAPI 文档，用于读取全局认证要求。 */
  documentData?: OpenAPI.Document | null;
  /** 当前接口按区域拆分的生成代码。 */
  codeMap?: TsCodeParts;
  /** 当前响应状态；all 表示合并展示全部响应。 */
  selectedResponse: string;
  /** 用户切换响应状态时的回调。 */
  onResponseChange: (status: string) => void;
};

/** Headers 分组中展示的一条请求元数据。 */
type HeaderItem = {
  /** 元数据名称。 */
  label: string;
  /** 元数据内容。 */
  value: string;
  /** 是否为接口调用时必须提供的请求头。 */
  required: boolean;
  /** 请求头所属的稳定展示分组。 */
  group: number;
};

/** OpenAPI 认证方案在页面中的展示信息。 */
type AuthorizationScheme = {
  /** 文档中 security requirement 使用的方案名称。 */
  name: string;
  /** 展示给用户的认证方案说明。 */
  label: string;
  /** 认证方案使用的请求头名称；非请求头认证时为空。 */
  headerName?: string;
};

/** 兼容 OpenAPI 2 与 3 的安全方案声明。 */
type SecuritySchemeDefinition = {
  /** 安全方案类型。 */
  type?: string;
  /** HTTP 认证协议。 */
  scheme?: string;
  /** API Key 在请求中的参数名称。 */
  name?: string;
  /** API Key 的传递位置。 */
  in?: string;
};

/** 将未约束的 OpenAPI 节点安全转换成普通对象。 */
function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** 根据认证方案定义生成简洁的展示名称和请求头。 */
function getAuthorizationScheme(name: string, definition?: SecuritySchemeDefinition): AuthorizationScheme {
  const type = definition?.type;
  if (type === "http") {
    const scheme = definition?.scheme?.trim();
    return {
      name,
      label: scheme ? `${name} (${scheme})` : name,
      headerName: "Authorization",
    };
  }
  if (type === "apiKey") {
    return {
      name,
      label: `${name} (API Key)`,
      headerName: definition?.in === "header" ? definition.name : undefined,
    };
  }
  if (type === "oauth2" || type === "openIdConnect") {
    return { name, label: `${name} (${type === "oauth2" ? "OAuth 2.0" : "OpenID Connect"})`, headerName: "Authorization" };
  }
  if (type === "basic") return { name, label: `${name} (Basic)`, headerName: "Authorization" };
  return { name, label: name };
}

/** 读取接口级或文档全局的认证要求；接口显式 security: [] 表示无需认证。 */
function getAuthorizationSchemes(api: ApiDetail, documentData?: OpenAPI.Document | null): AuthorizationScheme[] {
  const operation = getRecord(api.operation);
  const operationSecurity = operation?.security;
  const documentRecord = getRecord(documentData);
  const securityRequirements = Array.isArray(operationSecurity)
    ? operationSecurity
    : documentRecord?.security;
  if (!Array.isArray(securityRequirements) || securityRequirements.length === 0) return [];

  const components = getRecord(documentRecord?.components);
  const definitions = getRecord(components?.securitySchemes) ?? getRecord(documentRecord?.securityDefinitions);
  const schemes = securityRequirements.flatMap((requirement) => {
    const requirementRecord = getRecord(requirement);
    if (!requirementRecord) return [];
    return Object.keys(requirementRecord).map((name) => getAuthorizationScheme(
      name,
      getRecord(definitions?.[name]) as SecuritySchemeDefinition | undefined,
    ));
  });

  return schemes.filter((scheme, index) => schemes.findIndex((item) => item.name === scheme.name) === index);
}

/** 从 OpenAPI 请求体中读取首个声明的内容类型。 */
function getRequestContentType(api: ApiDetail): string | undefined {
  const requestBody = (api.operation as unknown as {
    requestBody?: { content?: Record<string, unknown> };
  } | undefined)?.requestBody;

  return Object.keys(requestBody?.content ?? {})[0];
}

/** 将 OpenAPI Header 参数转换为详情页可展示的内容。 */
function getHeaderItems(api: ApiDetail, authorizationSchemes: AuthorizationScheme[]): HeaderItem[] {
  const contentType = getRequestContentType(api);
  const headerItems = (api.operation?.parameters ?? [])
    .flatMap((parameter) => {
      const item = parameter as Record<string, unknown>;
      if (item.in !== "header" || typeof item.name !== "string") return [];

      const name = item.name;
      const schema = item.schema as Record<string, unknown> | undefined;
      const type = typeof schema?.type === "string"
        ? schema.type
        : typeof item.type === "string"
          ? item.type
          : undefined;
      const description = typeof item.description === "string" ? item.description.trim() : "";
      const required = item.required === true;
      const details = [required ? "必填" : "可选", type, description].filter(Boolean);

      return [{
        label: name,
        value: details.join(" · "),
        required,
        group: getHeaderGroup(name),
      }];
    });

  if (contentType && !headerItems.some((item) => item.label.toLowerCase() === "content-type")) {
    headerItems.push({
      label: "Content-Type",
      value: `请求体：${contentType}`,
      required: true,
      group: 0,
    });
  }

  authorizationSchemes.forEach((scheme) => {
    if (!scheme.headerName || headerItems.some((item) => item.label.toLowerCase() === scheme.headerName?.toLowerCase())) return;
    headerItems.push({
      label: scheme.headerName,
      value: `认证：${scheme.label}`,
      required: true,
      group: getHeaderGroup(scheme.headerName),
    });
  });

  return headerItems.sort((left, right) => (
    Number(right.required) - Number(left.required)
    || left.group - right.group
    || left.label.localeCompare(right.label, "en")
  ));
}

/** 返回请求头的稳定展示分组：协议、认证、业务。 */
function getHeaderGroup(name: string): number {
  const normalizedName = name.toLowerCase();
  if (normalizedName === "content-type" || normalizedName === "accept") return 0;
  if (normalizedName === "authorization" || normalizedName.includes("api-key") || normalizedName.includes("token")) return 1;
  return 2;
}

/** 接口信息、Headers、Request 与 Response 的连续详情视图。 */
const ApiInfo = ({ api, apiBaseUrl, documentData, codeMap, selectedResponse, onResponseChange }: ApiInfoProps) => {
  const title = api.operation?.summary;
  const description = api.operation?.description?.trim();
  const shouldShowDescription = Boolean(description) && description !== title?.trim();
  const tags = api.operation?.tags ?? [];
  const parameters = api.operation?.parameters ?? [];
  const responses = Object.keys(api.operation?.responses ?? {});
  const hasRequestBody = Boolean(
    (api.operation as Record<string, unknown> | undefined)?.requestBody,
  );
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
  const authorizationSchemes = useMemo(() => getAuthorizationSchemes(api, documentData), [api, documentData]);
  const headerItems = useMemo<HeaderItem[]>(() => getHeaderItems(api, authorizationSchemes), [api, authorizationSchemes]);
  const requestTypes = codeMap?.["Request Types"]?.trim();
  const responseCode = selectedResponse === "all"
    ? codeMap?.Responses?.map((response) =>
      `// 响应 ${response.status}${response.description ? `：${response.description}` : ""}\n${response.code.replaceAll("ResponseData", `Response${response.status}`)}`,
    ).join("\n\n") || codeMap?.["Response Data"]
    : codeMap?.Responses?.find((item) => item.status === selectedResponse)?.code;
  const responseTypes = selectedResponse === "all"
    ? codeMap?.Responses?.map((response) => response.responseModels).filter(Boolean).join("\n\n")
    : codeMap?.Responses?.find((item) => item.status === selectedResponse)?.responseModels;
  const relatedTypes = Array.from(new Set([requestTypes, responseTypes?.trim()].filter(Boolean)))
    .join("\n\n") || "// 当前接口没有关联类型";

  const handleCopyFullPath = async () => {
    const copied = await copyToClipboard(fullApiPath);
    if (copied) {
      message.success("已复制完整接口 URL");
      return;
    }
    message.error("复制失败，请重试");
  };

  return (
    <article className="api-doc">
      <header className="api-doc__header">
        <div className="api-doc__breadcrumb">
          <span className="api-doc__breadcrumb-group" title={groupName}>{groupName}</span>
          <span className="api-doc__breadcrumb-separator">&gt;</span>
          <span className="api-doc__breadcrumb-name" title={interfaceName}>{interfaceName}</span>
        </div>
        <div className="api-doc__title-row">
          <Method method={api.method} isActive />
          <code className="api-doc__path" title={api.path}>{api.path}</code>
          <Tooltip title="复制完整接口 URL">
            <button type="button" className="api-doc__copy-url" onClick={() => void handleCopyFullPath()}>
              <CopyOutlined />
              复制 URL
            </button>
          </Tooltip>
        </div>
        <h1 className="api-doc__name" title={title || api.path}>{title || api.path}</h1>
        {shouldShowDescription ? <p className="api-doc__description">{description}</p> : null}
        <div className="api-doc__stats">
          <span>参数 {parameters.length}</span>
          <span>请求体 {hasRequestBody ? "有" : "无"}</span>
          <span>响应码 {responses.length}</span>
          {authorizationSchemes.length ? <span>认证 {authorizationSchemes.map((scheme) => scheme.label).join(" / ")}</span> : null}
          {api.operation?.operationId ? <span>operationId: {api.operation.operationId}</span> : null}
          {tags.map((tag) => <span key={tag}>{tag}</span>)}
          {api.operation?.deprecated ? <span>Deprecated</span> : null}
        </div>
      </header>

      <div className="api-doc__layout">
        <main className="api-doc__main">
          <section className="api-doc__section" aria-labelledby="headers-title">
            <h2 id="headers-title" className="api-doc__section-title">Headers</h2>
            {headerItems.length ? (
              <dl className="api-doc__headers">
                {headerItems.map((item) => (
                  <div key={item.label} className="api-doc__header-row">
                    <dt>{item.label}</dt>
                    <dd title={item.value}>{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="api-doc__headers-empty">该接口未声明请求 Header</p>}
          </section>

          <section className="api-doc__section" aria-labelledby="request-title">
            <h2 id="request-title" className="api-doc__section-title">Request</h2>
            <div className="api-doc__code-group">
              <CodeCard title="Path parameters" code={codeMap?.["Query Params"]} maxVisibleLines={7} />
              {hasRequestBody ? <CodeCard title="Request body" code={codeMap?.["Request Body"]} /> : null}
            </div>
          </section>

          <section className="api-doc__response" aria-labelledby="response-title">
            <div className="api-doc__response-heading">
              <h2 id="response-title" className="api-doc__section-title">Response</h2>
              {codeMap?.Responses?.length ? (
                <ResponseTabs responses={codeMap.Responses} value={selectedResponse} onChange={onResponseChange} label="响应状态选择" />
              ) : null}
            </div>
            <CodeCard title={selectedResponse === "all" ? "All responses" : `Response ${selectedResponse}`} code={responseCode} />
          </section>
        </main>

        <aside className="api-doc__related" aria-label="关联类型">
          <CodeCard title="关联类型" code={relatedTypes} maxVisibleLines={22} />
        </aside>
      </div>
    </article>
  );
};

export default ApiInfo;
