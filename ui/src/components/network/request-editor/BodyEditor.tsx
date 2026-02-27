import React from "react";
import { Button, Input, Select, Space, Typography } from "antd";
import type { BodyMode, KeyValueItem, RawBodyType } from "./RequestEditor.types.ts";
import KeyValueTable from "./KeyValueTable.tsx";

const { TextArea } = Input;
const { Text } = Typography;

type BodyEditorProps = {
  method: string;
  bodyMode: BodyMode;
  rawBodyType: RawBodyType;
  bodyRaw: string;
  formFields: KeyValueItem[];
  disabled?: boolean;
  onModeChange: (mode: BodyMode) => void;
  onRawBodyTypeChange: (type: RawBodyType) => void;
  onRawChange: (value: string) => void;
  onFormAdd: () => void;
  onFormRemove: (id: string) => void;
  onFormChange: (id: string, patch: Partial<Pick<KeyValueItem, "key" | "value" | "enabled">>) => void;
};

const BODY_MODE_OPTIONS = [
  { label: "none", value: "none" },
  { label: "form-data", value: "form-data" },
  { label: "x-www-form-urlencoded", value: "x-www-form-urlencoded" },
  { label: "raw", value: "raw" },
  { label: "binary", value: "binary" },
];

const RAW_BODY_OPTIONS = [
  { label: "JSON", value: "json" },
  { label: "Text", value: "text" },
  { label: "XML", value: "xml" },
];

const BodyEditor: React.FC<BodyEditorProps> = ({
  method,
  bodyMode,
  rawBodyType,
  bodyRaw,
  formFields,
  disabled,
  onModeChange,
  onRawBodyTypeChange,
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

      {!bodyLocked && bodyMode === "raw" && (
        <div className="req-body-raw">
          <Space className="req-body-actions" wrap>
            <Select
              value={rawBodyType}
              disabled={disabled}
              options={RAW_BODY_OPTIONS}
              onChange={(value) => onRawBodyTypeChange(value as RawBodyType)}
              className="req-raw-type"
            />
            {rawBodyType === "json" && (
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
            )}
          </Space>
          <TextArea
            value={bodyRaw}
            disabled={disabled}
            placeholder={
              rawBodyType === "json"
                ? '{"hello":"world"}'
                : rawBodyType === "xml"
                  ? "<xml></xml>"
                  : "raw text"
            }
            autoSize={{ minRows: 8, maxRows: 18 }}
            onChange={(event) => onRawChange(event.target.value)}
          />
        </div>
      )}

      {!bodyLocked && (bodyMode === "x-www-form-urlencoded" || bodyMode === "form-data") && (
        <KeyValueTable
          items={formFields}
          disabled={disabled}
          keyPlaceholder={bodyMode === "form-data" ? "field name" : "field"}
          valuePlaceholder={bodyMode === "form-data" ? "field value" : "value"}
          onAdd={onFormAdd}
          onRemove={onFormRemove}
          onChange={onFormChange}
        />
      )}

      {!bodyLocked && bodyMode === "binary" && (
        <TextArea
          value={bodyRaw}
          disabled={disabled}
          placeholder="binary payload (text/base64)"
          autoSize={{ minRows: 6, maxRows: 14 }}
          onChange={(event) => onRawChange(event.target.value)}
        />
      )}
    </div>
  );
};

export default BodyEditor;
