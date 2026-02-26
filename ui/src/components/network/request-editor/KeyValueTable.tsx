import React from "react";
import { Button, Input, Switch } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { KeyValueItem } from "./RequestEditor.types.ts";

type KeyValueTableProps = {
  items: KeyValueItem[];
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  disabled?: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, patch: Partial<Pick<KeyValueItem, "key" | "value" | "enabled">>) => void;
};

const KeyValueTable: React.FC<KeyValueTableProps> = ({
  items,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  disabled,
  onAdd,
  onRemove,
  onChange,
}) => {
  return (
    <div className="req-kv-table">
      <div className="req-kv-head">
        <span className="req-kv-col req-kv-enable">启用</span>
        <span className="req-kv-col req-kv-key">Key</span>
        <span className="req-kv-col req-kv-value">Value</span>
        <span className="req-kv-col req-kv-op">操作</span>
      </div>

      {items.map((item) => (
        <div className="req-kv-row" key={item.id}>
          <div className="req-kv-col req-kv-enable">
            <Switch
              size="small"
              checked={item.enabled}
              disabled={disabled}
              onChange={(checked) => onChange(item.id, { enabled: checked })}
            />
          </div>
          <div className="req-kv-col req-kv-key">
            <Input
              value={item.key}
              disabled={disabled}
              placeholder={keyPlaceholder}
              onChange={(event) => onChange(item.id, { key: event.target.value })}
            />
          </div>
          <div className="req-kv-col req-kv-value">
            <Input
              value={item.value}
              disabled={disabled}
              placeholder={valuePlaceholder}
              onChange={(event) => onChange(item.id, { value: event.target.value })}
            />
          </div>
          <div className="req-kv-col req-kv-op">
            <Button
              type="text"
              danger
              disabled={disabled}
              icon={<DeleteOutlined />}
              onClick={() => onRemove(item.id)}
            />
          </div>
        </div>
      ))}

      <Button
        type="dashed"
        disabled={disabled}
        icon={<PlusOutlined />}
        onClick={onAdd}
      >
        新增
      </Button>
    </div>
  );
};

export default KeyValueTable;
