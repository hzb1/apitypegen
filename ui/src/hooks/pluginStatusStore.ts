import {
  checkPluginEnabled,
  getPluginCheckCache,
  type CheckPluginEnabledOptions,
} from "../../../extension/src/shared/proxySdk.ts";
import { requestDebugStore } from "@/debug/requestDebugStore.ts";
import type { PluginStatus } from "./usePluginEnabled.ts";

type PluginStatusSnapshot = {
  status: PluginStatus;
  checking: boolean;
  lastCheckedAt?: number;
  lastReason?: string;
};

type PluginStatusCheckOptions = {
  force?: boolean;
  reason: string;
};

const listeners = new Set<() => void>();

let snapshot: PluginStatusSnapshot = {
  status: "checking",
  checking: false,
};

function emit() {
  listeners.forEach((listener) => listener());
}

function updateSnapshot(patch: Partial<PluginStatusSnapshot>) {
  const next = { ...snapshot, ...patch };
  if (
    next.status === snapshot.status &&
    next.checking === snapshot.checking &&
    next.lastCheckedAt === snapshot.lastCheckedAt &&
    next.lastReason === snapshot.lastReason
  ) {
    return;
  }
  snapshot = next;
  emit();
}

function recordActualExtensionCheck(reason?: string) {
  const normalizedReason = reason || "检测浏览器扩展";
  console.info("[apitypegen:extension-check]", {
    reason: normalizedReason,
    reasonLabel: normalizedReason,
    sourceLabel: "检测浏览器扩展",
    cacheLabel: "实际检测",
  });
  requestDebugStore.recordEvent({
    source: "extension-check",
    reason: normalizedReason,
    requestKey: `extension-check|${Date.now()}`,
    url: "window.postMessage:PLUGIN_PING",
    detail: normalizedReason === "用户手动检测" ? "用户手动检测" : "实际检测浏览器扩展",
  });
}

export const pluginStatusStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot() {
    return snapshot;
  },
  check(options: PluginStatusCheckOptions) {
    if (document.visibilityState !== "visible" && !options.force) {
      return Promise.resolve(snapshot.status === "available");
    }

    const cache = getPluginCheckCache();
    const cacheStillValid = Boolean(cache && Date.now() - cache.checkedAt <= 10_000);
    if (!options.force && cacheStillValid) {
      updateSnapshot({
        status: cache!.enabled ? "available" : "unavailable",
        checking: false,
        lastCheckedAt: cache!.checkedAt,
        lastReason: `${options.reason}（缓存命中）`,
      });
      return Promise.resolve(cache!.enabled);
    }

    if (!snapshot.checking) {
      updateSnapshot({
        checking: true,
        status: snapshot.status === "available" ? "available" : "checking",
        lastReason: options.reason,
      });
    }

    const checkOptions: CheckPluginEnabledOptions = {
      force: options.force,
      reason: options.reason,
      onActualCheck: recordActualExtensionCheck,
    };

    return checkPluginEnabled(checkOptions)
      .then((enabled) => {
        const nextCache = getPluginCheckCache();
        updateSnapshot({
          status: enabled ? "available" : "unavailable",
          checking: false,
          lastCheckedAt: nextCache?.checkedAt ?? Date.now(),
          lastReason: options.reason,
        });
        return enabled;
      })
      .catch(() => {
        updateSnapshot({
          status: "unavailable",
          checking: false,
          lastCheckedAt: Date.now(),
          lastReason: options.reason,
        });
        return false;
      });
  },
};
