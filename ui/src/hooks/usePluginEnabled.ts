import {useCallback, useEffect, useState} from "react";
import {checkPluginEnabled} from "../../../extension/src/shared/proxySdk.ts";

export type PluginStatus = "checking" | "available" | "unavailable";

/**
 * 插件可用性检测 (当页面激活时)
 */
export const usePluginEnabled = () => {
  const [status, setStatus] = useState<PluginStatus>("checking")


  const check = useCallback(() => {
    if (document.visibilityState !== 'visible') return

    setStatus("checking")
    checkPluginEnabled()
      .then((enabled) => {
        setStatus(enabled ? "available" : "unavailable")
      })
      .catch(() => {
        setStatus("unavailable")
      })
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check()
  }, [check])

  useEffect(() => {
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)

    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [check])

  const checking = status === "checking";
  const pluginEnabled = status === "available";

  return {
    status,
    pluginEnabled,
    checking,
    recheck: check,
  }
}
