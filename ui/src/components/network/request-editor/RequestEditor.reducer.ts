import type { AuthType, BodyMode, KeyValueItem, RequestDraft } from "./RequestEditor.types.ts";
import {
  createInitialDraft,
  createKeyValueItem,
  mergeParamsToUrl,
  parseUrlToParams,
} from "./RequestEditor.utils.ts";

type ListField = "params" | "headers" | "formFields";

type RequestEditorAction =
  | { type: "reset"; payload?: Partial<RequestDraft> }
  | { type: "set_method"; payload: string }
  | { type: "set_url"; payload: string }
  | { type: "set_body_mode"; payload: BodyMode }
  | { type: "set_body_raw"; payload: string }
  | { type: "set_timeout"; payload: number }
  | { type: "set_auth_type"; payload: AuthType }
  | { type: "set_auth_username"; payload: string }
  | { type: "set_auth_password"; payload: string }
  | { type: "set_auth_token"; payload: string }
  | { type: "add_item"; payload: { field: ListField } }
  | { type: "remove_item"; payload: { field: ListField; id: string } }
  | {
      type: "update_item";
      payload: {
        field: ListField;
        id: string;
        patch: Partial<Pick<KeyValueItem, "key" | "value" | "enabled">>;
      };
    };

export function requestEditorReducer(
  state: RequestDraft,
  action: RequestEditorAction,
): RequestDraft {
  switch (action.type) {
    case "reset": {
      return createInitialDraft(action.payload);
    }
    case "set_method": {
      const nextMethod = action.payload.toUpperCase();
      const shouldDropBody = nextMethod === "GET" || nextMethod === "HEAD";
      return {
        ...state,
        method: nextMethod,
        bodyMode: shouldDropBody ? "none" : state.bodyMode,
      };
    }
    case "set_url": {
      return {
        ...state,
        url: action.payload,
        params: parseUrlToParams(action.payload),
      };
    }
    case "set_body_mode": {
      return {
        ...state,
        bodyMode: action.payload,
      };
    }
    case "set_body_raw": {
      return {
        ...state,
        bodyRaw: action.payload,
      };
    }
    case "set_timeout": {
      return {
        ...state,
        timeoutMs: action.payload,
      };
    }
    case "set_auth_type": {
      return {
        ...state,
        auth: {
          ...state.auth,
          type: action.payload,
        },
      };
    }
    case "set_auth_username": {
      return {
        ...state,
        auth: {
          ...state.auth,
          username: action.payload,
        },
      };
    }
    case "set_auth_password": {
      return {
        ...state,
        auth: {
          ...state.auth,
          password: action.payload,
        },
      };
    }
    case "set_auth_token": {
      return {
        ...state,
        auth: {
          ...state.auth,
          token: action.payload,
        },
      };
    }
    case "add_item": {
      const nextList = [...state[action.payload.field], createKeyValueItem()];
      return patchList(state, action.payload.field, nextList);
    }
    case "remove_item": {
      const nextList = state[action.payload.field].filter((item) => item.id !== action.payload.id);
      return patchList(state, action.payload.field, nextList.length ? nextList : [createKeyValueItem()]);
    }
    case "update_item": {
      const nextList = state[action.payload.field].map((item) => {
        if (item.id !== action.payload.id) return item;
        return {
          ...item,
          ...action.payload.patch,
        };
      });
      return patchList(state, action.payload.field, nextList);
    }
    default:
      return state;
  }
}

function patchList(state: RequestDraft, field: ListField, nextList: KeyValueItem[]): RequestDraft {
  const nextState = {
    ...state,
    [field]: nextList,
  } as RequestDraft;

  if (field === "params") {
    nextState.url = mergeParamsToUrl(nextState.url, nextList);
  }

  return nextState;
}
