import type { Dispatch, SetStateAction } from "react";
import { Drawer, InputNumber, Select, Switch } from "antd";
import type { ConfigState } from "@/hooks/useOptions.ts";

type ProjectConfigDrawerProps = {
  open: boolean;
  onClose: () => void;
  configState: ConfigState;
  setConfigState: Dispatch<SetStateAction<ConfigState>>;
};

export default function ProjectConfigDrawer(props: ProjectConfigDrawerProps) {
  const { open, onClose, configState, setConfigState } = props;

  return (
    <Drawer
      title="项目配置"
      placement="right"
      size={460}
      open={open}
      onClose={onClose}
      className="project-config-drawer"
    >
      <div className="project-config-panel">
        <div className="project-config-item">
          <span>展示 Example</span>
          <Switch
            checked={configState.showExample}
            onChange={(checked) => setConfigState((prev) => ({...prev, showExample: checked}))}
          />
        </div>
        <div className="project-config-item">
          <span>Int64 转 String</span>
          <Switch
            checked={configState.int64ToString}
            onChange={(checked) => setConfigState((prev) => ({...prev, int64ToString: checked}))}
          />
        </div>
        <div className="project-config-item">
          <span>生成 Interface</span>
          <Switch
            checked={configState.useInterface}
            onChange={(checked) => setConfigState((prev) => ({...prev, useInterface: checked}))}
          />
        </div>
        <div className="project-config-item">
          <span>添加 Export</span>
          <Switch
            checked={configState.addExport}
            onChange={(checked) => setConfigState((prev) => ({...prev, addExport: checked}))}
          />
        </div>
        <div className="project-config-item">
          <span>语句分号</span>
          <Switch
            checked={configState.semicolon}
            onChange={(checked) => setConfigState((prev) => ({...prev, semicolon: checked}))}
          />
        </div>
        <div className="project-config-item project-config-item-column">
          <span>命名策略</span>
          <Select
            value={configState.namingStrategy || undefined}
            onChange={(value) => setConfigState((prev) => ({...prev, namingStrategy: value ?? ""}))}
            allowClear
            options={[
              {value: "removeVO", label: "去掉 VO 后缀"},
              {value: "removeDTO", label: "去掉 DTO 后缀"},
              {value: "prefixI", label: "添加 I 前缀"},
            ]}
            placeholder="不处理"
          />
        </div>
        <div className="project-config-item project-config-item-column">
          <span>缩进空格</span>
          <InputNumber
            min={0}
            max={8}
            value={configState.indent}
            onChange={(value) => setConfigState((prev) => ({...prev, indent: typeof value === "number" ? value : 2}))}
            style={{width: "100%"}}
          />
        </div>
      </div>
    </Drawer>
  );
}
