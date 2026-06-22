import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenAPI } from "openapi-types";
import type { SetURLSearchParams } from "react-router";
import type { SideBarProps } from "@/components/sidebar/SideBar.tsx";
import { useApiNavigationData } from "@/hooks/useApiNavigationData.ts";
import type { ScrollRequest } from "../home.types.ts";

type UseHomeApiNavigationParams = {
  documentData: OpenAPI.Document | null;
  selectedApiKey: string | null;
  isDemoMode: boolean;
  setSearchParams: SetURLSearchParams;
};

export function useHomeApiNavigation(params: UseHomeApiNavigationParams) {
  const { documentData, selectedApiKey, isDemoMode, setSearchParams } = params;
  const [expandedGroupList, setExpandedGroupList] = useState<string[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const scrollRequestIdRef = useRef(0);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | undefined>(undefined);

  const { selectedApi, apiMap, apiKeyToGroupId, apiGroups } = useApiNavigationData({
    documentData,
    selectedApiKey,
    expandedGroupList,
  });

  const handleGroupTitleClick = (groupItem: SideBarProps["apis"][number]) => {
    const groupId = groupItem.id;
    setExpandedGroupList((prev) => {
      if (prev.includes(groupId)) {
        return prev.filter((id) => id !== groupId);
      }
      return [...prev, groupId];
    });
  };

  const onMenuSelect = useCallback((key: string) => {
    const targetGroupId = apiKeyToGroupId.get(key);
    if (targetGroupId) {
      setExpandedGroupList((prev) => (
        prev.includes(targetGroupId) ? prev : [...prev, targetGroupId]
      ));
    }
    setMobileNavOpen(false);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("api", key);
      return next;
    });
  }, [apiKeyToGroupId, setSearchParams]);

  const onViewedTabSelect = useCallback((key: string) => {
    scrollRequestIdRef.current += 1;
    setScrollRequest({
      key,
      id: scrollRequestIdRef.current,
    });
    onMenuSelect(key);
  }, [onMenuSelect]);

  const handleToolbarSearchSelect = useCallback((key: string) => {
    setMobileNavOpen(false);
    onViewedTabSelect(key);
  }, [onViewedTabSelect]);

  // Demo 模式需要一进来就看到内容，而不是停在“请选择 API”的空状态。
  useEffect(() => {
    if (!isDemoMode || selectedApiKey) return;
    const firstApiKey = apiGroups[0]?.children?.[0]?.key;
    if (!firstApiKey) return;

    setSearchParams((prev) => {
      if (prev.get("api")) return prev;
      const next = new URLSearchParams(prev);
      next.set("api", firstApiKey);
      return next;
    }, {replace: true});
  }, [apiGroups, isDemoMode, selectedApiKey, setSearchParams]);

  // 首次进入或通过 URL 选中 API 时，自动展开对应分组。
  useEffect(() => {
    setExpandedGroupList((prev) => {
      if (!apiGroups.length) {
        return prev.length ? [] : prev;
      }

      if (prev.length) return prev;
      const selectedGroupId = selectedApiKey ? apiKeyToGroupId.get(selectedApiKey) : undefined;
      return selectedGroupId ? [selectedGroupId] : prev;
    });
  }, [apiGroups, apiKeyToGroupId, selectedApiKey]);

  return {
    selectedApi,
    apiMap,
    apiGroups,
    mobileNavOpen,
    setMobileNavOpen,
    scrollRequest,
    handleGroupTitleClick,
    onMenuSelect,
    onViewedTabSelect,
    handleToolbarSearchSelect,
  };
}
