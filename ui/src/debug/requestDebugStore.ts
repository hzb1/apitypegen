import { useEffect, useState } from "react";
import {
  getFetchTypeLabel,
  getReasonLabel,
  getSourceLabel,
  getStageLabel,
} from "./requestDebugLabels.ts";

export type RequestDebugStage = "probe" | "config" | "document" | "event";
export type RequestDebugSource =
  | "direct-document"
  | "swagger-config-probe"
  | "service-document"
  | "auto-select-service"
  | "extension-check";
export type RequestDebugFetchType = "native" | "proxy" | "event";
export type RequestDebugStatus = "pending" | "success" | "error" | "event" | "cancelled";

export type RequestDebugEntry = {
  id: string;
  requestKey: string;
  url: string;
  method: string;
  status: RequestDebugStatus;
  stage: RequestDebugStage;
  source: RequestDebugSource;
  reason: string;
  fetchType: RequestDebugFetchType;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  statusCode?: number;
  error?: string;
  duplicate?: boolean;
  detail?: string;
};

export type RequestDebugStartInput = {
  requestKey: string;
  url: string;
  method?: string;
  stage: RequestDebugStage;
  source: RequestDebugSource;
  reason: string;
  fetchType: Exclude<RequestDebugFetchType, "event">;
};

export type RequestDebugEventInput = {
  requestKey: string;
  url: string;
  stage?: RequestDebugStage;
  source: RequestDebugSource;
  reason: string;
  detail?: string;
};

const STORAGE_KEY = "ts-swagger-debug-requests";
const MAX_ENTRIES = 100;
const DUPLICATE_WINDOW_MS = 1500;

type Snapshot = {
  available: boolean;
  enabled: boolean;
  entries: RequestDebugEntry[];
};

const listeners = new Set<() => void>();
const devDefaultEnabled = import.meta.env.DEV;
const initialStorageValue = readStorageValue();
const initialUrlEnabled = readUrlEnabled();
let snapshot: Snapshot = {
  available: devDefaultEnabled || initialStorageValue !== null || initialUrlEnabled,
  enabled: initialUrlEnabled || initialStorageValue === "1" || (devDefaultEnabled && initialStorageValue !== "0"),
  entries: [],
};

function readStorageValue() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function readUrlEnabled() {
  try {
    return new URLSearchParams(window.location.search).get("debugRequests") === "1";
  } catch {
    return false;
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function updateSnapshot(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

function createEntryId() {
  return `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function shouldMarkDuplicate(requestKey: string, now: number) {
  return snapshot.entries.some(
    (entry) =>
      entry.requestKey === requestKey &&
      now - entry.startedAt <= DUPLICATE_WINDOW_MS,
  );
}

function pushEntry(entry: RequestDebugEntry) {
  if (!snapshot.enabled) return;
  const entries = [entry, ...snapshot.entries].slice(0, MAX_ENTRIES);
  updateSnapshot({ entries });
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function formatConsolePayload(entry: RequestDebugEntry) {
  return {
    source: entry.source,
    sourceLabel: getSourceLabel(entry.source),
    stage: entry.stage,
    stageLabel: getStageLabel(entry.stage),
    reason: entry.reason,
    reasonLabel: getReasonLabel(entry.reason),
    requestKey: entry.requestKey,
    fetchType: entry.fetchType,
    fetchTypeLabel: getFetchTypeLabel(entry.fetchType),
    duplicate: entry.duplicate,
    url: entry.url,
  };
}

export const requestDebugStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot() {
    return snapshot;
  },
  setEnabled(enabled: boolean) {
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // ignore
    }
    updateSnapshot({ available: true, enabled });
  },
  clear() {
    updateSnapshot({ entries: [] });
  },
  recordRequestStart(input: RequestDebugStartInput) {
    const now = Date.now();
    const entry: RequestDebugEntry = {
      id: createEntryId(),
      requestKey: input.requestKey,
      url: input.url,
      method: input.method ?? "GET",
      status: "pending",
      stage: input.stage,
      source: input.source,
      reason: input.reason,
      fetchType: input.fetchType,
      startedAt: now,
      duplicate: shouldMarkDuplicate(input.requestKey, now),
    };

    if (snapshot.enabled) {
      console.info("[apitypegen:request]", formatConsolePayload(entry));
    }
    pushEntry(entry);
    return entry.id;
  },
  recordRequestSuccess(id: string, statusCode: number) {
    if (!snapshot.enabled) return;
    const now = Date.now();
    updateSnapshot({
      entries: snapshot.entries.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              status: "success",
              statusCode,
              endedAt: now,
              durationMs: now - entry.startedAt,
            }
          : entry,
      ),
    });
  },
  recordRequestError(id: string, error: unknown) {
    if (!snapshot.enabled) return;
    if (isAbortError(error)) {
      this.recordRequestCancelled(id, "请求已取消");
      return;
    }
    const now = Date.now();
    const message = error instanceof Error ? error.message : String(error);
    updateSnapshot({
      entries: snapshot.entries.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              status: "error",
              error: message,
              endedAt: now,
              durationMs: now - entry.startedAt,
            }
          : entry,
      ),
    });
  },
  recordRequestCancelled(id: string, reason: string) {
    if (!snapshot.enabled) return;
    const now = Date.now();
    updateSnapshot({
      entries: snapshot.entries.map((entry) =>
        entry.id === id && entry.status === "pending"
          ? {
              ...entry,
              status: "cancelled",
              endedAt: now,
              durationMs: now - entry.startedAt,
              detail: reason,
            }
          : entry,
      ),
    });
  },
  recordEvent(input: RequestDebugEventInput) {
    const now = Date.now();
    const entry: RequestDebugEntry = {
      id: createEntryId(),
      requestKey: input.requestKey,
      url: input.url,
      method: "-",
      status: "event",
      stage: input.stage ?? "event",
      source: input.source,
      reason: input.reason,
      fetchType: "event",
      startedAt: now,
      endedAt: now,
      durationMs: 0,
      duplicate: shouldMarkDuplicate(input.requestKey, now),
      detail: input.detail,
    };

    if (snapshot.enabled) {
      const tag = input.source === "auto-select-service"
        ? "[apitypegen:auto-select-service]"
        : "[apitypegen:request]";
      console.info(tag, formatConsolePayload(entry));
    }
    pushEntry(entry);
  },
};

export function useRequestDebugSnapshot() {
  const [current, setCurrent] = useState(() => requestDebugStore.getSnapshot());

  useEffect(
    () =>
      requestDebugStore.subscribe(() => {
        setCurrent(requestDebugStore.getSnapshot());
      }),
    [],
  );

  return current;
}
