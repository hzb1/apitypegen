import { useMemo } from "react";
import type { OpenAPI } from "openapi-types";
import type { ApiDetail } from "../../types.ts";
import { getApiSlug, stableHash } from "@/utils/getApiSlug.ts";
import type { ApiGroup } from "@/pages/home/utils.ts";

type UseApiNavigationDataParams = {
  documentData: OpenAPI.Document | null;
  selectedApiKey: string | null;
  expandedGroupList: string[];
};

export function buildGroupedApis(documentData: OpenAPI.Document | null) {
  if (!documentData?.paths) return {} as Record<string, ApiDetail[]>;

  const groups: Record<string, ApiDetail[]> = {};
  for (const [path, item] of Object.entries(documentData.paths)) {
    for (const method of ["get", "post", "put", "delete", "patch"] as const) {
      const operation = item?.[method];
      if (!operation) continue;
      const tag = operation.tags?.[0] ?? "Default";
      (groups[tag] ||= []).push({
        key: getApiSlug({ path, method, operation }),
        path,
        method,
        operation,
      });
    }
  }
  return groups;
}

export function buildApiGroups(params: {
  groupedApis: Record<string, ApiDetail[]>;
  selectedApiKey: string | null;
  expandedGroupList: string[];
}) {
  const { groupedApis, selectedApiKey, expandedGroupList } = params;
  return Object.entries(groupedApis).map(([tag, apis]): ApiGroup => {
    const id = stableHash(tag);
    return {
      id,
      name: tag,
      isExpanded: expandedGroupList.includes(id),
      children: apis.map((api) => ({
        ...api,
        isSelected: Boolean(selectedApiKey) && api.key === selectedApiKey,
      })),
    };
  });
}

export function useApiNavigationData(params: UseApiNavigationDataParams) {
  const { documentData, selectedApiKey, expandedGroupList } = params;

  const groupedApis = useMemo(() => buildGroupedApis(documentData), [documentData]);

  const apiMap = useMemo(() => {
    const map = new Map<string, ApiDetail>();
    Object.values(groupedApis).forEach((apis) => {
      apis.forEach((api) => map.set(api.key, api));
    });
    return map;
  }, [groupedApis]);

  // 复用上面的 apiMap 做 O(1) 查找，避免对 groupedApis 做线性扫描。
  const selectedApi = useMemo(
    () => (selectedApiKey ? (apiMap.get(selectedApiKey) ?? null) : null),
    [apiMap, selectedApiKey]
  );

  const apiKeyToGroupId = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(groupedApis).forEach(([tag, apis]) => {
      const groupId = stableHash(tag);
      apis.forEach((api) => {
        map.set(api.key, groupId);
      });
    });
    return map;
  }, [groupedApis]);

  const apiGroups = useMemo(() => (
    buildApiGroups({ groupedApis, selectedApiKey, expandedGroupList })
  ), [expandedGroupList, groupedApis, selectedApiKey]);

  return {
    groupedApis,
    selectedApi,
    apiMap,
    apiKeyToGroupId,
    apiGroups,
  };
}
