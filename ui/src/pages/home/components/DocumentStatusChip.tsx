import { CheckCircleOutlined, CloudOutlined, DatabaseOutlined, ThunderboltOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";

export type DocumentMode = "remote" | "local" | "demo";

type DocumentStatusChipProps = {
  mode: DocumentMode;
  saved?: boolean;
  serviceStatusText?: string;
  serviceStatusKind?: "loading" | "ready" | "error";
};

const modeConfig: Record<DocumentMode, { label: string; icon: ReactNode }> = {
  remote: {
    label: "远程",
    icon: <CloudOutlined />,
  },
  local: {
    label: "本地",
    icon: <DatabaseOutlined />,
  },
  demo: {
    label: "Demo",
    icon: <ThunderboltOutlined />,
  },
};

export default function DocumentStatusChip(props: DocumentStatusChipProps) {
  const config = modeConfig[props.mode];

  return (
    <span className="document-status-chips">
      <span className={`document-status-chip is-${props.mode}`}>
        {config.icon}
        <span>{config.label}</span>
      </span>
      {props.saved ? (
        <span className="document-status-chip is-saved">
          <CheckCircleOutlined />
          <span>已保存</span>
        </span>
      ) : null}
      {props.serviceStatusText ? (
        <span className={`document-status-chip is-service-${props.serviceStatusKind ?? "ready"}`}>
          <span>{props.serviceStatusText}</span>
        </span>
      ) : null}
    </span>
  );
}
