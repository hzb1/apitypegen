import React, { useEffect, useMemo, useReducer, useState } from "react";
import {
  Alert,
  Button,
  Dropdown,
  Input,
  InputNumber,
  message,
  Select,
  Space,
  Tabs,
  Typography,
} from "antd";
import type { RequestEditorProps } from "./RequestEditor.types.ts";
import KeyValueTable from "./KeyValueTable.tsx";
import BodyEditor from "./BodyEditor.tsx";
import { requestEditorReducer } from "./RequestEditor.reducer.ts";
import {
  buildCopySnippet,
  createInitialDraft,
  type CopyAsFormat,
  validateDraft,
} from "./RequestEditor.utils.ts";
import "./RequestEditor.css";

const { Text } = Typography;

const METHOD_OPTIONS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"];

const RequestEditor: React.FC<RequestEditorProps> = ({
  value,
  loading,
  disabled,
  enableAuthTab = true,
  onChange,
  onSend,
  onCancel,
  onSaveTemplate
}) => {
  const [draft, dispatch] = useReducer(requestEditorReducer, createInitialDraft(value));
  const [errors, setErrors] = useState<string[]>([]);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    dispatch({ type: "reset", payload: value });
  }, [value]);

  useEffect(() => {
    onChange?.(draft);
  }, [draft, onChange]);

  const tabItems = useMemo(() => {
    const items = [
      {
        key: "params",
        label: "Params",
        children: (
          <KeyValueTable
            items={draft.params}
            disabled={disabled || loading}
            keyPlaceholder="query key"
            valuePlaceholder="query value"
            onAdd={() => dispatch({ type: "add_item", payload: { field: "params" } })}
            onRemove={(id) => dispatch({ type: "remove_item", payload: { field: "params", id } })}
            onChange={(id, patch) =>
              dispatch({ type: "update_item", payload: { field: "params", id, patch } })
            }
          />
        ),
      },
      {
        key: "headers",
        label: "Headers",
        children: (
          <KeyValueTable
            items={draft.headers}
            disabled={disabled || loading}
            keyPlaceholder="header key"
            valuePlaceholder="header value"
            onAdd={() => dispatch({ type: "add_item", payload: { field: "headers" } })}
            onRemove={(id) => dispatch({ type: "remove_item", payload: { field: "headers", id } })}
            onChange={(id, patch) =>
              dispatch({ type: "update_item", payload: { field: "headers", id, patch } })
            }
          />
        ),
      },
      {
        key: "body",
        label: "Body",
        children: (
          <BodyEditor
            method={draft.method}
            bodyMode={draft.bodyMode}
            rawBodyType={draft.rawBodyType}
            bodyRaw={draft.bodyRaw}
            formFields={draft.formFields}
            disabled={disabled || loading}
            onModeChange={(mode) => dispatch({ type: "set_body_mode", payload: mode })}
            onRawBodyTypeChange={(type) => dispatch({ type: "set_raw_body_type", payload: type })}
            onRawChange={(text) => dispatch({ type: "set_body_raw", payload: text })}
            onFormAdd={() => dispatch({ type: "add_item", payload: { field: "formFields" } })}
            onFormRemove={(id) => dispatch({ type: "remove_item", payload: { field: "formFields", id } })}
            onFormChange={(id, patch) =>
              dispatch({ type: "update_item", payload: { field: "formFields", id, patch } })
            }
          />
        ),
      },
      {
        key: "cookies",
        label: "Cookies",
        children: (
          <div className="req-cookies-panel">
            <div className="req-cookies-header">
              <Text type="secondary">Include browser cookies</Text>
              <Button
                size="small"
                type={draft.includeCredentials ? "primary" : "default"}
                disabled={disabled || loading}
                onClick={() =>
                  dispatch({
                    type: "set_include_credentials",
                    payload: !draft.includeCredentials,
                  })
                }
              >
                {draft.includeCredentials ? "ON" : "OFF"}
              </Button>
            </div>
            <KeyValueTable
              items={draft.cookieItems}
              disabled={disabled || loading}
              keyPlaceholder="cookie name"
              valuePlaceholder="cookie value"
              onAdd={() => dispatch({ type: "add_item", payload: { field: "cookieItems" } })}
              onRemove={(id) => dispatch({ type: "remove_item", payload: { field: "cookieItems", id } })}
              onChange={(id, patch) =>
                dispatch({ type: "update_item", payload: { field: "cookieItems", id, patch } })
              }
            />
          </div>
        ),
      },
    ];

    if (enableAuthTab) {
      items.splice(1, 0, {
        key: "authorization",
        label: "Authorization",
        children: (
          <div className="req-auth-panel">
            <Space direction="vertical" size={12} className="req-auth-content">
              <div className="req-auth-row">
                <Text type="secondary">Type</Text>
                <Select
                  value={draft.auth.type}
                  disabled={disabled || loading}
                  options={[
                    { value: "none", label: "No Auth" },
                    { value: "basic", label: "Basic Auth" },
                    { value: "bearer", label: "Bearer Token" },
                  ]}
                  onChange={(value) => dispatch({ type: "set_auth_type", payload: value })}
                  className="req-auth-type"
                />
              </div>

              {draft.auth.type === "basic" && (
                <>
                  <Input
                    placeholder="username"
                    value={draft.auth.username}
                    disabled={disabled || loading}
                    onChange={(event) =>
                      dispatch({ type: "set_auth_username", payload: event.target.value })
                    }
                  />
                  <Input.Password
                    placeholder="password"
                    value={draft.auth.password}
                    disabled={disabled || loading}
                    onChange={(event) =>
                      dispatch({ type: "set_auth_password", payload: event.target.value })
                    }
                  />
                </>
              )}

              {draft.auth.type === "bearer" && (
                <Input.Password
                  placeholder="token"
                  value={draft.auth.token}
                  disabled={disabled || loading}
                  onChange={(event) =>
                    dispatch({ type: "set_auth_token", payload: event.target.value })
                  }
                />
              )}
            </Space>
          </div>
        ),
      });
    }

    return items;
  }, [disabled, draft, enableAuthTab, loading]);

  const handleSend = () => {
    const next = validateDraft(draft);
    setErrors(next.errors);
    if (!next.valid) return;
    onSend(draft);
  };

  const handleCopyAs = async (format: CopyAsFormat) => {
    const next = validateDraft(draft);
    if (!next.valid) {
      setErrors(next.errors);
      return;
    }

    const snippet = buildCopySnippet(draft, format);
    try {
      await navigator.clipboard.writeText(snippet);
      messageApi.success(`已复制 ${format.toUpperCase()}`);
    } catch {
      messageApi.error("复制失败，请检查浏览器权限");
    }
  };

  return (
    <div className="request-editor">
      {contextHolder}
      <div className="req-topline">
        <Select
          value={draft.method}
          disabled={disabled || loading}
          options={METHOD_OPTIONS.map((value) => ({ value }))}
          onChange={(value) => dispatch({ type: "set_method", payload: value })}
          className="req-method"
        />

        <Input
          value={draft.url}
          disabled={disabled || loading}
          onChange={(event) => dispatch({ type: "set_url", payload: event.target.value })}
          placeholder="https://example.com/api"
          className="req-url"
        />

        <InputNumber
          min={1}
          max={120000}
          value={draft.timeoutMs}
          disabled={disabled || loading}
          onChange={(value) => dispatch({ type: "set_timeout", payload: Number(value || 0) })}
          addonAfter="ms"
          className="req-timeout"
        />

        <Space>
          {onCancel && (
            <Button disabled={disabled || !loading} onClick={onCancel}>
              Cancel
            </Button>
          )}
          {onSaveTemplate && (
            <Button disabled={disabled || loading} onClick={() => onSaveTemplate(draft)}>
              Save
            </Button>
          )}
          <Dropdown
            menu={{
              items: [
                { key: "fetch", label: "Copy as fetch" },
                { key: "xhr", label: "Copy as XHR" },
                { key: "axios", label: "Copy as axios" },
                { key: "curl", label: "Copy as cURL" },
              ],
              onClick: ({ key }) => void handleCopyAs(key as CopyAsFormat),
            }}
            trigger={["click"]}
          >
            <Button disabled={disabled || loading}>Copy as</Button>
          </Dropdown>
          <Button type="primary" loading={loading} disabled={disabled} onClick={handleSend}>
            Send
          </Button>
        </Space>
      </div>

      {errors.length > 0 && (
        <Alert
          type="error"
          showIcon
          message={errors.join("；")}
          className="req-errors"
        />
      )}

      <Tabs items={tabItems} />
    </div>
  );
};

export default RequestEditor;
