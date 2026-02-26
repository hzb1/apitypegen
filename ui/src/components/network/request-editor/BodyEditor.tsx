import React from "react";
import { Button, Input, Select, Space, Typography } from "antd";
import type { BodyMode, KeyValueItem } from "./RequestEditor.types.ts";
import KeyValueTable from "./KeyValueTable.tsx";

const { TextArea } = Input;
const { Text } = Typography;

type BodyEditorProps = {
  method: string;
  bodyMode: BodyMode;
  bodyRaw: string;
  formFields: KeyValueItem[];
  disabled?: boolean;
  onModeChange: (mode: BodyMode) => void;
  onRawChange: (value: string) => void;
  onFormAdd: () => void;
  onFormRemove: (id: string) => void;
  onFormChange: (id: string, patch: Partial<Pick<KeyValueItem, "key" | "value" | "enabled">>) => void;
};

const BODY_MODE_OPTIONS = [
  { label: "none", value: "none" },
  { label: "json", value: "json" },
  { label: "text", value: "text" },
  { label: "x-www-form-urlencoded", value: "form" },
];

const BodyEditor: React.FC<BodyEditorProps> = ({
  method,
  bodyMode,
  bodyRaw,
  formFields,
  disabled,
  onModeChange,
  onRawChange,
  onFormAdd,
  onFormRemove,
  onFormChange,
}) => {
  const methodUpper = method.toUpperCase();
  const bodyLocked = methodUpper === "GET" || methodUpper === "HEAD";

  return (
    <div className="req-body-editor">
      <Space align="center" className="req-body-toolbar">
        <Text type="secondary">Body Type</Text>
        <Select
          value={bodyLocked ? "none" : bodyMode}
          disabled={disabled || bodyLocked}
          options={BODY_MODE_OPTIONS}
          onChange={(value) => onModeChange(value as BodyMode)}
          className="req-body-mode"
        />
        {bodyLocked && <Text type="secondary">{methodUpper} 不支持 Body</Text>}
      </Space>

      {!bodyLocked && bodyMode === "json" && (
        <div className="req-body-raw">
          <Space className="req-body-actions">
            <Button
              size="small"
              disabled={disabled}
              onClick={() => {
                try {
                  const formatted = JSON.stringify(JSON.parse(bodyRaw || "{}"), null, 2);
                  onRawChange(formatted);
                } catch {
                  // keep current content
                }
              }}
            >
              格式化 JSON
            </Button>
          </Space>
          <TextArea
            value={bodyRaw}
            disabled={disabled}
            placeholder='{"hello":"world"}'
            autoSize={{ minRows: 8, maxRows: 18 }}
            onChange={(event) => onRawChange(event.target.value)}
          />
        </div>
      )}

      {!bodyLocked && bodyMode === "text" && (
        <TextArea
          value={bodyRaw}
          disabled={disabled}
          placeholder="raw text"
          autoSize={{ minRows: 8, maxRows: 18 }}
          onChange={(event) => onRawChange(event.target.value)}
        />
      )}

      {!bodyLocked && bodyMode === "form" && (
        <KeyValueTable
          items={formFields}
          disabled={disabled}
          keyPlaceholder="field"
          valuePlaceholder="value"
          onAdd={onFormAdd}
          onRemove={onFormRemove}
          onChange={onFormChange}
        />
      )}
    </div>
  );
};

export default BodyEditor;
