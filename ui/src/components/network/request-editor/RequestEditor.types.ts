import type { RequestSpec } from "@extension/src/shared/types.ts";

export type BodyMode = "none" | "json" | "text" | "form";

export type AuthType = "none" | "basic" | "bearer";

export type KeyValueItem = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
};

export type RequestDraft = {
  method: string;
  url: string;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  auth: {
    type: AuthType;
    username?: string;
    password?: string;
    token?: string;
  };
  bodyMode: BodyMode;
  bodyRaw: string;
  formFields: KeyValueItem[];
  timeoutMs: number;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export type BuildRequestResult = {
  requestSpec: RequestSpec;
  init: RequestInit;
};

export type RequestEditorProps = {
  value?: Partial<RequestDraft>;
  loading?: boolean;
  disabled?: boolean;
  enableAuthTab?: boolean;
  onChange?: (draft: RequestDraft) => void;
  onSend: (draft: RequestDraft) => void;
  onCancel?: () => void;
  onReplay?: () => void;
  onSaveTemplate?: (draft: RequestDraft) => void;
};
