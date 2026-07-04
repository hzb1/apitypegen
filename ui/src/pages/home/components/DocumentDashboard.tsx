import {
  ApiOutlined,
  AppstoreOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
import Method from "@/components/ui/Method/Method.tsx";
import type { ApiDetail } from "../../../../types.ts";
import type { DocumentMode } from "./DocumentStatusChip.tsx";

export type DashboardServiceItem = {
  name: string;
  value: string;
  apiCount?: number;
  isActive: boolean;
  loading?: boolean;
  error?: string | null;
};

export type DashboardGroupStat = {
  name: string;
  count: number;
};

export type DashboardRecentApi = ApiDetail & {
  groupName?: string;
};

export type DocumentDashboardProps = {
  title: string;
  version?: string;
  sourceText?: string;
  mode: DocumentMode;
  saved: boolean;
  apiCount: number;
  groupCount: number;
  serviceCount: number;
  localLibraryCount: number;
  methodStats: Array<{ method: string; count: number }>;
  topGroups: DashboardGroupStat[];
  recentApis: DashboardRecentApi[];
  services: DashboardServiceItem[];
  onServiceSelect: (serviceUrl: string) => void;
  onApiSelect: (apiKey: string) => void;
};

const modeLabels: Record<DocumentMode, string> = {
  remote: "远程文档",
  local: "本地文档",
  demo: "Demo 文档",
};

export default function DocumentDashboard(props: DocumentDashboardProps) {
  const {
    title,
    version,
    sourceText,
    mode,
    saved,
    apiCount,
    groupCount,
    serviceCount,
    localLibraryCount,
    methodStats,
    topGroups,
    recentApis,
    services,
    onServiceSelect,
    onApiSelect,
  } = props;

  return (
    <div className="document-dashboard">
      <section className="document-dashboard-hero">
        <div className="document-dashboard-title-block">
          <div className="document-dashboard-kicker">{modeLabels[mode]}</div>
          <h1 title={title}>{title}</h1>
          <div className="document-dashboard-subtitle" title={sourceText}>
            {version ? <span>v{version}</span> : null}
            {sourceText ? <span>{sourceText}</span> : null}
          </div>
        </div>
        <div className="document-dashboard-state">
          <span className={`document-dashboard-state-chip is-${mode}`}>{modeLabels[mode]}</span>
          {saved ? <span className="document-dashboard-state-chip is-saved">已保存</span> : null}
        </div>
      </section>

      <section className="document-dashboard-metrics">
        <MetricCard icon={<ApiOutlined />} label="接口总数" value={apiCount} />
        <MetricCard icon={<AppstoreOutlined />} label="分组数量" value={groupCount} />
        <MetricCard icon={<CloudServerOutlined />} label="服务数量" value={serviceCount || 1} />
        <MetricCard icon={<DatabaseOutlined />} label="本地文档" value={localLibraryCount} />
      </section>

      <section className="document-dashboard-grid">
        <div className="document-dashboard-panel">
          <div className="document-dashboard-panel-head">
            <h2>方法分布</h2>
          </div>
          {methodStats.length ? (
            <div className="document-dashboard-methods">
              {methodStats.map((item) => (
                <div key={item.method} className="document-dashboard-method-row">
                  <Method method={item.method.toLowerCase()} isActive={false} />
                  <div className="document-dashboard-bar">
                    <span style={{ width: `${Math.max(8, (item.count / apiCount) * 100)}%` }} />
                  </div>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="document-dashboard-empty">暂无方法统计</div>
          )}
        </div>

        <div className="document-dashboard-panel">
          <div className="document-dashboard-panel-head">
            <h2>Top 分组</h2>
          </div>
          {topGroups.length ? (
            <div className="document-dashboard-groups">
              {topGroups.map((group) => (
                <div key={group.name} className="document-dashboard-group-row">
                  <span title={group.name}>{group.name}</span>
                  <strong>{group.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="document-dashboard-empty">暂无分组</div>
          )}
        </div>

        <div className="document-dashboard-panel">
          <div className="document-dashboard-panel-head">
            <h2>最近查看</h2>
            <HistoryOutlined />
          </div>
          {recentApis.length ? (
            <div className="document-dashboard-recent">
              {recentApis.map((api) => (
                <button
                  key={api.key}
                  type="button"
                  className="document-dashboard-recent-item"
                  onClick={() => onApiSelect(api.key)}
                >
                  <Method method={api.method} isActive={false} />
                  <span>
                    <strong title={api.operation?.summary || api.path}>
                      {api.operation?.summary || api.path}
                    </strong>
                    <small title={api.path}>{api.path}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="document-dashboard-empty">还没有查看过接口</div>
          )}
        </div>

        <div className="document-dashboard-panel">
          <div className="document-dashboard-panel-head">
            <h2>服务总览</h2>
            <FolderOpenOutlined />
          </div>
          {services.length > 1 ? (
            <div className="document-dashboard-services">
              {services.map((service) => (
                <button
                  key={service.value}
                  type="button"
                  className={`document-dashboard-service ${service.isActive ? "is-active" : ""} ${service.loading ? "is-loading" : ""} ${service.error ? "is-error" : ""}`}
                  onClick={() => onServiceSelect(service.value)}
                >
                  <span>
                    <strong title={service.name}>{service.name}</strong>
                    <small title={service.value}>{service.value}</small>
                  </span>
                  <em>
                    {service.error
                      ? "加载失败"
                      : service.loading
                        ? "加载中"
                        : typeof service.apiCount === "number" ? `${service.apiCount} APIs` : "未加载"}
                  </em>
                </button>
              ))}
            </div>
          ) : (
            <div className="document-dashboard-empty">当前文档只有一个服务</div>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard(props: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="document-dashboard-metric">
      <span>{props.icon}</span>
      <div>
        <strong>{props.value}</strong>
        <small>{props.label}</small>
      </div>
    </div>
  );
}
