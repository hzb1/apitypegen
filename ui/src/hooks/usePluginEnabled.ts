import { useCallback, useEffect, useSyncExternalStore } from "react";
import { pluginStatusStore } from "./pluginStatusStore.ts";

export type PluginStatus = "checking" | "available" | "unavailable";

/**
 * 浏览器扩展可用性检测。
 * 检测状态由模块级 store 共享，避免多个组件重复 PLUGIN_PING。
 */
export const usePluginEnabled = () => {
  const snapshot = useSyncExternalStore(
    pluginStatusStore.subscribe,
    pluginStatusStore.getSnapshot,
    pluginStatusStore.getSnapshot,
  );

  const check = useCallback(
    (force = false, reason = force ? "用户手动检测" : "页面可见或获得焦点") =>
      pluginStatusStore.check({ force, reason }),
    [],
  );

  useEffect(() => {
    void pluginStatusStore.check({ reason: "页面初始化" });
  }, []);

  // useEffect(() => {
  //   const checkWhenVisible = () => {
  //     void pluginStatusStore.check({ reason: "页面可见或获得焦点" });
  //   };
  //
  //   document.addEventListener("visibilitychange", checkWhenVisible);
  //   window.addEventListener("focus", checkWhenVisible);
  //
  //   return () => {
  //     document.removeEventListener("visibilitychange", checkWhenVisible);
  //     window.removeEventListener("focus", checkWhenVisible);
  //   };
  // }, []);

  const checking = snapshot.checking || snapshot.status === "checking";
  const pluginEnabled = snapshot.status === "available";

  return {
    status: snapshot.status,
    pluginEnabled,
    checking,
    lastCheckedAt: snapshot.lastCheckedAt,
    lastReason: snapshot.lastReason,
    recheck: () => check(true, "用户手动检测"),
  };
};
