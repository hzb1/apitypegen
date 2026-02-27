import type { RequestSpec } from "@extension/src/shared/types.ts";

export type BodyMode =
  | "none"
  | "raw"
  | "x-www-form-urlencoded"
  | "form-data"
  | "binary";

export type RawBodyType = "json" | "text" | "xml";

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
  rawBodyType: RawBodyType;
  bodyRaw: string;
  formFields: KeyValueItem[];
  cookieItems: KeyValueItem[];
  timeoutMs: number;
  includeCredentials: boolean;
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
