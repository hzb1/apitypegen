import "./ApiInfo.css";
import CodeCard from "../code-card/CodeCard.tsx";
import type { ApiDetail } from "../../../types.ts";
import Method from "../ui/Method/Method.tsx";

type ApiInfoProps = {
  api: ApiDetail;
  codeMap?: {
    Models: string;
    "Query Params": string;
    "Request Body": string;
    "Response Data": string;
  };
};

const ApiInfo = ({ api, codeMap }: ApiInfoProps) => {
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
  const pathSegments = api.path.split("/").filter(Boolean);
  const endpointName = pathSegments[pathSegments.length - 1] ?? api.path;

  return (
    <div className="api-doc">
      <header className="api-doc-header">
        <span className="api-doc-kicker">Endpoint</span>
        <h1>{title || api.path}</h1>
        {description ? <p className="api-doc-description">{description}</p> : null}

        <div className="api-doc-meta">
          {operationId ? (
            <span className="api-doc-chip">operationId: {operationId}</span>
          ) : null}
          {tags.map((tag) => (
            <span key={tag} className="api-doc-chip tag">{tag}</span>
          ))}
          {isDeprecated ? <span className="api-doc-chip warning">Deprecated</span> : null}
        </div>

        <div className="api-doc-path-card">
          <div className="api-doc-path-main">
            <Method method={api.method} isActive />
            <code>{api.path}</code>
          </div>
          <div className="api-doc-path-tail">/{endpointName}</div>
        </div>
      </header>

      <section className="api-doc-stats">
        <article>
          <h4>参数</h4>
          <p>{parameters.length}</p>
        </article>
        <article>
          <h4>请求体</h4>
          <p>{hasRequestBody ? "有" : "无"}</p>
        </article>
        <article>
          <h4>响应码</h4>
          <p>{responses.length || 0}</p>
        </article>
      </section>

      {responses.length ? (
        <section className="api-doc-responses">
          <h3>响应状态</h3>
          <div className="api-doc-response-list">
            {responses.map((statusCode) => (
              <span key={statusCode} className="api-doc-response-item">
                {statusCode}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <div className="api-doc-cards">
        <CodeCard title="Query Params" code={codeMap?.["Query Params"]} />
        <CodeCard title="Request Body" code={codeMap?.["Request Body"]} />
        <CodeCard title="Response Data" code={codeMap?.["Response Data"]} />
      </div>
    </div>
  );
};

export default ApiInfo;
