import { useEffect, useMemo, useState } from "react";
import type { OpenAPI } from "openapi-types";
import { buildApiGroups, buildGroupedApis } from "@/hooks/useApiNavigationData.ts";
import { getApiBaseUrl } from "./useApiBaseUrl.ts";
import type { ApiGroup } from "../utils.ts";
import {
  buildServiceDocumentUrl,
  fetchOpenApiDocument,
  normalizeDocumentBaseUrl,
} from "../serviceDocumentLoader.ts";

export type AllServiceDocumentOption = {
  label: string;
  value: string;
};

export type AllServiceDocumentEntry = AllServiceDocumentOption & {
  document: OpenAPI.Document | null;
  apiGroups: ApiGroup[];
  apiBaseUrl: string;
  loading: boolean;
  error: string | null;
};

export type AllServiceDocumentProgress = {
  loaded: number;
  total: number;
  loading: number;
  failed: number;
  allLoaded: boolean;
};

type UseAllServiceDocumentsParams = {
  enabled: boolean;
  documentBaseUrl: string;
  serviceOptions: AllServiceDocumentOption[];
  pluginEnabled?: boolean;
};

function buildCacheKey(documentBaseUrl: string, serviceOptions: AllServiceDocumentOption[]) {
  return `${documentBaseUrl}__${serviceOptions.map((service) => `${service.label}:${service.value}`).join("|")}`;
}

function createLoadingEntry(service: AllServiceDocumentOption): AllServiceDocumentEntry {
  return {
    ...service,
    document: null,
    apiGroups: [],
    apiBaseUrl: "",
    loading: true,
    error: null,
  };
}

function buildLoadedEntry(params: {
  service: AllServiceDocumentOption;
  document: OpenAPI.Document;
  serviceDocumentUrl: string;
}): AllServiceDocumentEntry {
  const groupedApis = buildGroupedApis(params.document);
  const apiGroups = buildApiGroups({
    groupedApis,
    selectedApiKey: null,
    expandedGroupList: [],
  });

  return {
    ...params.service,
    document: params.document,
    apiGroups,
    apiBaseUrl: getApiBaseUrl({
      documentData: params.document,
      normalizedDocInput: params.serviceDocumentUrl,
    }),
    loading: false,
    error: null,
  };
}

export function useAllServiceDocuments(params: UseAllServiceDocumentsParams) {
  const { enabled, documentBaseUrl, serviceOptions, pluginEnabled } = params;
  const normalizedBaseUrl = useMemo(
    () => normalizeDocumentBaseUrl(documentBaseUrl || ""),
    [documentBaseUrl],
  );
  const cacheKey = useMemo(
    () => buildCacheKey(normalizedBaseUrl, serviceOptions),
    [normalizedBaseUrl, serviceOptions],
  );
  const [state, setState] = useState<{
    key: string;
    entries: AllServiceDocumentEntry[];
  }>({
    key: "",
    entries: [],
  });

  useEffect(() => {
    if (!enabled || !normalizedBaseUrl || !serviceOptions.length) {
      setState({ key: "", entries: [] });
      return;
    }

    let cancelled = false;
    setState({
      key: cacheKey,
      entries: serviceOptions.map(createLoadingEntry),
    });

    serviceOptions.forEach((service) => {
      const serviceDocumentUrl = buildServiceDocumentUrl(normalizedBaseUrl, service.value);
      void fetchOpenApiDocument(serviceDocumentUrl, pluginEnabled)
        .then((document) => {
          if (cancelled) return;
          const nextEntry = buildLoadedEntry({
            service,
            document,
            serviceDocumentUrl,
          });
          setState((current) => {
            if (current.key !== cacheKey) return current;
            return {
              ...current,
              entries: current.entries.map((entry) =>
                entry.value === service.value ? nextEntry : entry,
              ),
            };
          });
        })
        .catch((error) => {
          if (cancelled) return;
          const text = error instanceof Error ? error.message : String(error);
          setState((current) => {
            if (current.key !== cacheKey) return current;
            return {
              ...current,
              entries: current.entries.map((entry) =>
                entry.value === service.value
                  ? {
                    ...entry,
                    loading: false,
                    error: text,
                  }
                  : entry,
              ),
            };
          });
        });
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled, normalizedBaseUrl, pluginEnabled, serviceOptions]);

  const entries = state.key === cacheKey ? state.entries : [];
  const progress = useMemo<AllServiceDocumentProgress>(() => {
    const total = entries.length;
    const loading = entries.filter((entry) => entry.loading).length;
    const failed = entries.filter((entry) => entry.error).length;
    const loaded = entries.filter((entry) => entry.document).length;
    return {
      loaded,
      total,
      loading,
      failed,
      allLoaded: total > 0 && loading === 0 && failed === 0 && loaded === total,
    };
  }, [entries]);

  return {
    enabled: enabled && Boolean(normalizedBaseUrl) && serviceOptions.length > 0,
    entries,
    progress,
    errors: entries.filter((entry) => entry.error),
  };
}
