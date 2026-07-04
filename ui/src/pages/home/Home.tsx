import React, { useCallback, useEffect, useMemo, useState } from "react";
import { message } from "antd";
import type { OpenAPI } from "openapi-types";
import "./Home.css";
import RequestDebugPanel from "@/debug/RequestDebugPanel.tsx";
import { useSwagger } from "@/hooks/useSwagger.ts";
import { useOptions } from "@/hooks/useOptions.ts";
import { usePluginEnabled } from "@/hooks/usePluginEnabled.ts";
import { useViewedApiTabs } from "@/hooks/useViewedApiTabs.ts";
import { useDocSearchHistory } from "@/hooks/useDocSearchHistory.tsx";
import DocumentTopbar from "./components/DocumentTopbar.tsx";
import DocumentWorkspace from "./components/DocumentWorkspace.tsx";
import ExportApiActions from "./components/ExportApiActions.tsx";
import LocalApiLibrary from "./components/LocalApiLibrary.tsx";
import MobileNavDrawer from "./components/MobileNavDrawer.tsx";
import ProjectConfigDrawer from "./components/ProjectConfigDrawer.tsx";
import RenameHistoryModal from "./components/RenameHistoryModal.tsx";
import WelcomeView from "./components/WelcomeView.tsx";
import DocumentDashboard, {
  type DashboardRecentApi,
  type DashboardServiceItem,
} from "./components/DocumentDashboard.tsx";
import type { DocumentMode } from "./components/DocumentStatusChip.tsx";
import type { AllServiceSearchGroup, SearchResultSelectContext } from "@/components/sidebar/ApiSearchDialog.tsx";
import type { SavedApiExport } from "./export/export.types.ts";
import { downloadTsSwaggerExport } from "./export/downloadJson.ts";
import { parseImportedApiExport } from "./export/importApiExport.ts";
import {
  isSameExportDocUrl,
  renameApiExport,
  renameApiExportsByDocUrl,
  saveApiExport,
} from "./export/localApiExportStore.ts";
import { buildApiGroups, buildGroupedApis } from "@/hooks/useApiNavigationData.ts";
import { useApiBaseUrl } from "./hooks/useApiBaseUrl.ts";
import { useHomeApiNavigation } from "./hooks/useHomeApiNavigation.ts";
import { useHomeDocumentState } from "./hooks/useHomeDocumentState.ts";
import { useHomeLoadingFeedback } from "./hooks/useHomeLoadingFeedback.ts";
import { useHomeTsCodeParts } from "./hooks/useHomeTsCodeParts.ts";
import { useLocalApiExports } from "./hooks/useLocalApiExports.ts";
import { useAllServiceDocuments } from "./hooks/useAllServiceDocuments.ts";

function getDocumentInfo(documentData: OpenAPI.Document | null) {
  const record = documentData as Record<string, unknown> | null;
  const info = record?.info && typeof record.info === "object"
    ? record.info as Record<string, unknown>
    : {};
  return {
    title: typeof info.title === "string" && info.title.trim() ? info.title.trim() : "",
    version: typeof info.version === "string" && info.version.trim() ? info.version.trim() : "",
  };
}

function buildSearchGroupsFromDocument(params: {
  documentData: OpenAPI.Document;
  selectedApiKey?: string | null;
}) {
  const groupedApis = buildGroupedApis(params.documentData);
  return buildApiGroups({
    groupedApis,
    selectedApiKey: params.selectedApiKey ?? null,
    expandedGroupList: Object.keys(groupedApis).map((tag) => String(tag)),
  });
}

const Home: React.FC = () => {
  /**
   * 文档来源状态：负责 URL 参数、输入框内容、Demo 模式和服务切换。
   * 这里是首页流程的起点，后面的 Swagger 加载、API 导航都依赖这些状态。
   */
  const {
    setSearchParams,
    ipFromUrl,
    serviceUrl,
    selectedApiKey,
    localId,
    isDemoMode,
    hasDocumentSource,
    normalizedDocInput,
    inputIp,
    setInputIp,
    reloadKey,
    handleCommitIp,
    handleTryDemo,
    handleTryMultiServiceDemo,
    handleOpenLocalExport,
    handleServiceChange,
  } = useHomeDocumentState();

  /**
   * 页面级弹层状态：配置抽屉属于首页局部 UI，不需要进入 URL。
   */
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false);
  const [localLibraryImporting, setLocalLibraryImporting] = useState(false);

  /**
   * 扩展状态：影响跨域/内网文档加载方式，也用于给用户展示安装和重检入口。
   */
  const {
    status: pluginStatus,
    pluginEnabled,
    checking,
    recheck: recheckPlugin,
  } = usePluginEnabled();

  /**
   * Swagger/OpenAPI 文档加载：Demo 使用原生 fetch，其它地址保持自动代理策略。
   */
  const {
    documentData: swaggerDocumentData,
    documentServiceUrl,
    configData,
    stage,
    error,
    errorDetail,
  } = useSwagger({
    docOrHost: ipFromUrl,
    ip: ipFromUrl,
    serviceUrl,
    reloadKey,
    fetchMode: isDemoMode ? "native" : "auto",
    extensionAvailable: pluginEnabled,
    options: {
      onAutoSelectService: (defaultUrl) => {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("service", defaultUrl);
          return next;
        }, {replace: true});
      },
      onDocumentLoaded: () => {
        // 保留扩展点：后续可在这里接入加载成功后的埋点或提示。
      },
      loadServiceDocument: false,
    },
  });

  /**
   * 本地接口库：local=<id> 时，从浏览器本地库读取保存过的数据包。
   */
  const {
    savedExports,
    activeLocalExport,
    libraryLoading,
    activeLoading,
    libraryError,
    activeError: localActiveError,
    refreshSavedExports,
    removeSavedExport,
  } = useLocalApiExports(localId);
  const savedDocUrls = useMemo(
    () => savedExports
      .map((record) => record.sourceDocUrl || record.payload.source.docUrl)
      .filter((value): value is string => Boolean(value)),
    [savedExports],
  );

  const handleSearchHistoryRename = useCallback((record: { value: string }, nextLabel: string) => {
    void renameApiExportsByDocUrl(record.value, nextLabel)
      .then((updated) => {
        if (updated.length) {
          void refreshSavedExports();
        }
      })
      .catch(() => undefined);
  }, [refreshSavedExports]);

  /**
   * 搜索历史：给文档地址输入框提供历史选项，并管理“重命名记录”弹窗。
   */
  const {
    autoCompleteOptions,
    renameTarget,
    renameValue,
    setRenameTarget,
    setRenameValue,
    confirmRename,
    recordSearchOnce,
    renameSearchRecordByValue,
    getLabelByValue,
  } = useDocSearchHistory({
    onRename: handleSearchHistoryRename,
    savedDocUrls,
  });

  const isLocalMode = Boolean(localId);
  const localServices = activeLocalExport?.payload.services;
  const activeLocalService = useMemo(() => {
    if (!localServices?.length) return undefined;
    return localServices.find((item) => item.url === serviceUrl) ?? localServices[0];
  }, [localServices, serviceUrl]);
  const serviceOptions = useMemo(() => {
    if (isLocalMode) {
      return localServices?.map((item) => ({
        label: item.name,
        value: item.url,
      })) || [];
    }
    return configData?.urls.map((item) => ({
      label: item.name,
      value: item.url,
    })) || [];
  }, [configData?.urls, isLocalMode, localServices]);
  const localSourceDocUrl = activeLocalExport?.payload.source.docUrl || "";
  const sourceDocUrl = isLocalMode ? localSourceDocUrl : ipFromUrl;
  const allServiceDocuments = useAllServiceDocuments({
    enabled: !isLocalMode && serviceOptions.length > 0,
    documentBaseUrl: normalizedDocInput || sourceDocUrl,
    serviceOptions,
    pluginEnabled,
  });
  const effectiveServiceUrl = isLocalMode
    ? activeLocalService?.url
    : serviceUrl ?? serviceOptions[0]?.value;
  const activeRemoteService = useMemo(() => {
    if (!allServiceDocuments.enabled) return undefined;
    return allServiceDocuments.entries.find((entry) => entry.value === effectiveServiceUrl)
      ?? allServiceDocuments.entries.find((entry) => entry.document)
      ?? allServiceDocuments.entries[0];
  }, [allServiceDocuments.enabled, allServiceDocuments.entries, effectiveServiceUrl]);
  const localDocumentData = (activeLocalService?.openapi ?? activeLocalExport?.payload.openapi) as
    | OpenAPI.Document
    | undefined;
  const remoteDocumentData = allServiceDocuments.enabled
    ? (activeRemoteService?.document ?? null)
    : swaggerDocumentData;
  const documentData = isLocalMode ? (localDocumentData ?? null) : remoteDocumentData;
  const activeRemoteError = allServiceDocuments.enabled ? activeRemoteService?.error ?? null : error;
  const activeError = isLocalMode ? localActiveError : activeRemoteError;
  const activeErrorDetail = isLocalMode
    ? (localActiveError ? { message: localActiveError } : null)
    : allServiceDocuments.enabled && activeRemoteService?.error
      ? { message: `${activeRemoteService.label} 加载失败`, reason: activeRemoteService.error }
      : errorDetail;

  /**
   * 加载态与生成配置：配置会直接影响右侧 TypeScript 输出。
   */
  const remoteLoading = stage === "probe" || stage === "config" || stage === "document";
  const allServiceActiveLoading = allServiceDocuments.enabled
    && !documentData
    && (allServiceDocuments.progress.loading > 0 || allServiceDocuments.entries.length === 0);
  const loading = isLocalMode ? activeLoading : remoteLoading || allServiceActiveLoading;
  const configLoading = !isLocalMode && stage === "config";
  // service 切换时旧文档还在内存，新 api key 可能在旧文档里找不到，
  // 在 effect 触发 LOAD_DOCUMENT 之前会闪一帧 dashboard。这里同步判定
  // "URL 的 serviceUrl 与当前文档归属的 service 不一致"，强制 loading。
  // local 模式文档来自内存且同步派生，不参与此判定。
  const serviceStale = !isLocalMode
    && !allServiceDocuments.enabled
    && (serviceUrl ?? null) !== (documentServiceUrl ?? null);
  const contentLoading = hasDocumentSource
    && !activeError
    && (remoteLoading || activeLoading || allServiceActiveLoading || !documentData || serviceStale);
  const remoteLoadingFeedback = useHomeLoadingFeedback(stage);
  const allServiceLoadingFeedback = allServiceDocuments.enabled && allServiceDocuments.progress.total > 0
    ? {
      title: "正在加载全部服务",
      button: `加载中 ${allServiceDocuments.progress.loaded}/${allServiceDocuments.progress.total}`,
      text: `已完成 ${allServiceDocuments.progress.loaded}/${allServiceDocuments.progress.total} 个服务，后续切换、搜索和本地保存都会复用这份数据`,
    }
    : null;
  const loadingFeedback = isLocalMode && activeLoading
    ? {
      title: "正在打开本地文档",
      button: "读取本地...",
      text: "正在从浏览器本地库读取接口数据",
    }
    : allServiceActiveLoading && allServiceLoadingFeedback
      ? allServiceLoadingFeedback
    : remoteLoadingFeedback;
  const { configState, setConfigState, generatorOptions } = useOptions();

  /**
   * API 导航：根据文档生成分组、当前 API、左侧展开状态和移动端导航状态。
   */
  const {
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
  } = useHomeApiNavigation({
    documentData,
    selectedApiKey,
    setSearchParams,
  });

  /**
   * 已查看 Tabs：记录用户浏览过的 API，并支持关闭、固定和关闭其它。
   */
  const viewedContextKey = useMemo(
    () => (localId
      ? `local:${localId}__${activeLocalService?.url ?? ""}`
      : `${ipFromUrl}__${effectiveServiceUrl ?? ""}`),
    [activeLocalService?.url, effectiveServiceUrl, ipFromUrl, localId],
  );
  const handleSelectApi = useCallback((nextApiKey?: string) => {
    // tab 选择 / 关闭当前 tab 回退都属于接口间切换，用 replace 不污染历史栈。
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextApiKey) {
        next.set("api", nextApiKey);
      } else {
        next.delete("api");
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // 兜底：文档加载完成后，若 URL 里的 api 在当前文档中不存在（手动改 URL / 过期链接），
  // 静默清掉它，避免 selectedApi 永远为 null 而 URL 残留无效参数。replace 不进历史。
  useEffect(() => {
    if (contentLoading || !selectedApiKey) return;
    if (apiMap.has(selectedApiKey)) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("api");
      return next;
    }, { replace: true });
  }, [contentLoading, selectedApiKey, apiMap, setSearchParams]);
  const {
    pinnedApiKeys,
    orderedViewedApiKeys,
    removeViewedTab,
    closeOtherViewedTabs,
    togglePinViewedTab,
  } = useViewedApiTabs({
    viewedContextKey,
    selectedApiKey,
    apiMap,
    onSelectApi: handleSelectApi,
  });

  /**
   * 派生展示数据：服务下拉、接口完整 URL、当前 API 的 TypeScript 类型片段。
   */
  const derivedApiBaseUrl = useApiBaseUrl({
    documentData,
    normalizedDocInput: isLocalMode ? localSourceDocUrl : normalizedDocInput,
  });
  const apiBaseUrl = activeLocalService?.apiBaseUrl
    || (!isLocalMode ? activeRemoteService?.apiBaseUrl : "")
    || (localServices?.length ? "" : activeLocalExport?.payload.source.apiBaseUrl)
    || derivedApiBaseUrl;
  const hasSavedCurrentDoc = useMemo(() => (
    Boolean(sourceDocUrl) && savedExports.some((record) =>
      isSameExportDocUrl(record.sourceDocUrl || record.payload.source.docUrl, sourceDocUrl),
    )
  ), [savedExports, sourceDocUrl]);
  const saveName = getLabelByValue(sourceDocUrl);
  const tsCodeParts = useHomeTsCodeParts({ documentData, selectedApi, generatorOptions });
  const documentInfo = useMemo(() => getDocumentInfo(documentData), [documentData]);
  const documentMode: DocumentMode = isLocalMode ? "local" : isDemoMode ? "demo" : "remote";
  const documentTitle = activeLocalExport?.name
    || documentInfo.title
    || (isDemoMode ? "示例项目" : "API 工作台");
  const documentSubtitle = isLocalMode
    ? activeLocalExport?.sourceDocUrl || activeLocalExport?.payload.source.importedFileName || "本地接口库"
    : sourceDocUrl || "TypeScript 类型生成";
  const dashboardApiGroups = useMemo(() => {
    if (localServices?.length) {
      return localServices.flatMap((service) => {
        const groupedApis = buildGroupedApis(service.openapi as OpenAPI.Document);
        return buildApiGroups({
          groupedApis,
          selectedApiKey: null,
          expandedGroupList: [],
        });
      });
    }
    if (allServiceDocuments.enabled) {
      return allServiceDocuments.entries.flatMap((entry) => entry.apiGroups);
    }
    return apiGroups;
  }, [allServiceDocuments.enabled, allServiceDocuments.entries, apiGroups, localServices]);
  const apiCount = apiGroups.reduce((total, group) => total + group.children.length, 0);
  const dashboardApiCount = dashboardApiGroups.reduce((total, group) => total + group.children.length, 0);
  const methodStats = useMemo(() => {
    const stats = new Map<string, number>();
    dashboardApiGroups.forEach((group) => {
      group.children.forEach((api) => {
        const method = api.method.toUpperCase();
        stats.set(method, (stats.get(method) ?? 0) + 1);
      });
    });
    const order = ["GET", "POST", "PUT", "DELETE", "PATCH"];
    return Array.from(stats.entries())
      .sort((a, b) => {
        const left = order.indexOf(a[0]);
        const right = order.indexOf(b[0]);
        if (left !== -1 || right !== -1) {
          return (left === -1 ? 99 : left) - (right === -1 ? 99 : right);
        }
        return b[1] - a[1];
      })
      .map(([method, count]) => ({ method, count }));
  }, [dashboardApiGroups]);
  const topGroups = useMemo(() => (
    dashboardApiGroups
      .map((group) => ({ name: group.name, count: group.children.length }))
      .filter((group) => group.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  ), [dashboardApiGroups]);
  const dashboardServices: DashboardServiceItem[] = useMemo(() => {
    if (localServices?.length) {
      return localServices.map((service) => ({
        name: service.name,
        value: service.url,
        apiCount: service.apis.length,
        isActive: service.url === activeLocalService?.url,
      }));
    }
    if (allServiceDocuments.enabled) {
      return allServiceDocuments.entries.map((service) => ({
        name: service.label,
        value: service.value,
        apiCount: service.document ? service.apiGroups.reduce((total, group) => total + group.children.length, 0) : undefined,
        isActive: service.value === effectiveServiceUrl,
        loading: service.loading,
        error: service.error,
      }));
    }
    return documentData
      ? [{
        name: documentTitle,
        value: sourceDocUrl,
        apiCount,
        isActive: true,
      }]
      : [];
  }, [
    activeLocalService?.url,
    allServiceDocuments.enabled,
    allServiceDocuments.entries,
    apiCount,
    documentData,
    documentTitle,
    effectiveServiceUrl,
    localServices,
    sourceDocUrl,
  ]);
  const recentApis = useMemo(() => (
    orderedViewedApiKeys
      .slice(-5)
      .reverse()
      .flatMap((key): DashboardRecentApi[] => {
        const api = apiMap.get(key);
        return api ? [api] : [];
      })
  ), [apiMap, orderedViewedApiKeys]);
  const localAllServiceGroups = useMemo<AllServiceSearchGroup[]>(() => {
    if (!localServices?.length) return [];
    return localServices.map((service) => ({
      serviceName: service.name,
      serviceValue: service.url,
      groups: buildSearchGroupsFromDocument({
        documentData: service.openapi as OpenAPI.Document,
        selectedApiKey: service.url === activeLocalService?.url ? selectedApiKey : null,
      }),
    }));
  }, [activeLocalService?.url, localServices, selectedApiKey]);
  const remoteAllServiceGroups = useMemo<AllServiceSearchGroup[]>(() => {
    if (!allServiceDocuments.enabled) return [];
    return allServiceDocuments.entries.flatMap((service) => {
      if (!service.document) return [];
      return [{
        serviceName: service.label,
        serviceValue: service.value,
        groups: buildSearchGroupsFromDocument({
          documentData: service.document,
          selectedApiKey: service.value === effectiveServiceUrl ? selectedApiKey : null,
        }),
      }];
    });
  }, [allServiceDocuments.enabled, allServiceDocuments.entries, effectiveServiceUrl, selectedApiKey]);
  const allServiceSearchLoadingText = allServiceDocuments.enabled
    && allServiceDocuments.progress.total > 1
    && allServiceDocuments.progress.loading > 0
    ? `正在加载全部服务 ${allServiceDocuments.progress.loaded}/${allServiceDocuments.progress.total}`
    : undefined;
  const allServiceSearchError = allServiceDocuments.errors.length
    ? allServiceDocuments.errors.map((entry) => `${entry.label}: ${entry.error}`).join("；")
    : undefined;
  const allServiceStatusText = useMemo(() => {
    if (!allServiceDocuments.enabled || allServiceDocuments.progress.total <= 1) return undefined;
    if (allServiceDocuments.progress.failed > 0) {
      return `多服务失败 ${allServiceDocuments.progress.failed}/${allServiceDocuments.progress.total}`;
    }
    if (allServiceDocuments.progress.loading > 0) {
      return `多服务 ${allServiceDocuments.progress.loaded}/${allServiceDocuments.progress.total}`;
    }
    return "全部服务已就绪";
  }, [allServiceDocuments.enabled, allServiceDocuments.progress]);
  const allServiceStatusKind = allServiceDocuments.progress.failed > 0
    ? "error" as const
    : allServiceDocuments.progress.loading > 0
      ? "loading" as const
      : "ready" as const;
  const handleSearchSelect = useCallback((key: string, context?: SearchResultSelectContext) => {
    if (context?.serviceValue && context.serviceValue !== effectiveServiceUrl) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("service", context.serviceValue || "");
        next.set("api", key);
        return next;
      });
      setMobileNavOpen(false);
      return;
    }
    handleToolbarSearchSelect(key);
  }, [effectiveServiceUrl, handleToolbarSearchSelect, setMobileNavOpen, setSearchParams]);

  useEffect(() => {
    if (!documentData || isLocalMode) return;
    recordSearchOnce(ipFromUrl);
  }, [documentData, isLocalMode, ipFromUrl, recordSearchOnce]);

  const handleDownloadLocalExport = useCallback((record: SavedApiExport) => {
    downloadTsSwaggerExport(record.payload);
  }, []);

  const handleDeleteLocalExport = useCallback(async (id: string) => {
    try {
      await removeSavedExport(id);
      message.success("已删除本地接口文档");
      if (localId === id) {
        setSearchParams(new URLSearchParams(), {replace: true});
      }
    } catch (deleteError) {
      const text = deleteError instanceof Error ? deleteError.message : String(deleteError);
      message.error(`删除失败：${text}`);
    }
  }, [localId, removeSavedExport, setSearchParams]);

  const handleRenameLocalExport = useCallback(async (record: SavedApiExport, name: string) => {
    try {
      const updated = await renameApiExport(record.id, name);
      const docUrl = updated.sourceDocUrl || updated.payload.source.docUrl;
      if (docUrl) {
        renameSearchRecordByValue(docUrl, updated.name);
      }
      await refreshSavedExports();
      message.success("已重命名本地接口文档");
    } catch (renameError) {
      const text = renameError instanceof Error ? renameError.message : String(renameError);
      message.error(`重命名失败：${text}`);
      throw renameError;
    }
  }, [refreshSavedExports, renameSearchRecordByValue]);

  const handleImportLocalExport = useCallback(async (file: File) => {
    setLocalLibraryImporting(true);
    try {
      const fileText = await file.text();
      const imported = parseImportedApiExport(fileText, file.name, configState, generatorOptions);
      const result = await saveApiExport(imported.payload, {
        name: getLabelByValue(imported.payload.source.docUrl) || imported.name,
      });
      await refreshSavedExports();
      message.success(result.created ? `已导入 ${imported.name}` : `已更新本地记录：${imported.name}`);
      handleOpenLocalExport(result.record.id);
    } catch (importError) {
      const text = importError instanceof Error ? importError.message : String(importError);
      message.error(`导入失败：${text}`);
      throw importError;
    } finally {
      setLocalLibraryImporting(false);
    }
  }, [configState, generatorOptions, getLabelByValue, handleOpenLocalExport, refreshSavedExports]);

  const handleBackHome = useCallback(() => {
    setSearchParams(new URLSearchParams(), {replace: true});
  }, [setSearchParams]);

  return (
    <>
      {hasDocumentSource ? (
        /* 文档模式：已经有 doc/ip 参数时，进入完整 API 工作台。 */
        <div className="views">
          {/* 顶部栏：品牌、文档地址输入、服务选择、项目配置入口和主题切换。 */}
          <DocumentTopbar
            documentMeta={{
              title: documentTitle,
              subtitle: documentSubtitle,
              mode: documentMode,
              saved: hasSavedCurrentDoc,
              serviceStatusText: allServiceStatusText,
              serviceStatusKind: allServiceStatusKind,
            }}
            inputIp={inputIp}
            setInputIp={setInputIp}
            autoCompleteOptions={autoCompleteOptions}
            handleCommitIp={handleCommitIp}
            loading={loading}
            loadingFeedback={loadingFeedback}
            serviceUrl={isLocalMode ? activeLocalService?.url : effectiveServiceUrl}
            configLoading={configLoading}
            serviceOptions={serviceOptions}
            handleServiceChange={handleServiceChange}
            setMobileNavOpen={setMobileNavOpen}
            setConfigDrawerOpen={setConfigDrawerOpen}
            extraActions={
              <ExportApiActions
                documentData={documentData}
                apiGroups={apiGroups}
                apiBaseUrl={apiBaseUrl}
                docUrl={sourceDocUrl}
                documentBaseUrl={normalizedDocInput}
                serviceUrl={isLocalMode ? activeLocalService?.url : effectiveServiceUrl}
                serviceOptions={!isLocalMode ? serviceOptions : undefined}
                serviceDocuments={!isLocalMode && allServiceDocuments.enabled ? allServiceDocuments.entries : undefined}
                serviceDocumentsProgress={!isLocalMode && allServiceDocuments.enabled ? allServiceDocuments.progress : undefined}
                pluginEnabled={pluginEnabled}
                existingPayload={isLocalMode ? activeLocalExport?.payload : undefined}
                saveName={saveName}
                hasSavedCurrentDoc={hasSavedCurrentDoc}
                generatorConfig={configState}
                generatorOptions={generatorOptions}
                onSaved={() => void refreshSavedExports()}
              />
            }
          />

          {/* 主工作区：左侧接口导航、已查看 Tabs、接口详情和 Models 面板。 */}
          <DocumentWorkspace
            error={activeError}
            errorDetail={activeErrorDetail}
            contentLoading={contentLoading}
            loadingFeedback={loadingFeedback}
            scrollRequest={scrollRequest}
            apiGroups={apiGroups}
            onMenuSelect={onMenuSelect}
            handleGroupTitleClick={handleGroupTitleClick}
            handleToolbarSearchSelect={handleSearchSelect}
            currentServiceLabel={activeLocalService?.name || serviceOptions.find((item) => item.value === effectiveServiceUrl)?.label}
            allServiceGroups={isLocalMode ? localAllServiceGroups : remoteAllServiceGroups}
            allServiceSearchEnabled={isLocalMode ? localAllServiceGroups.length > 1 : serviceOptions.length > 1}
            allServiceLoadingText={!isLocalMode ? allServiceSearchLoadingText : undefined}
            allServiceError={!isLocalMode ? allServiceSearchError : undefined}
            orderedViewedApiKeys={orderedViewedApiKeys}
            selectedApiKey={selectedApiKey}
            apiMap={apiMap}
            pinnedApiKeys={pinnedApiKeys}
            onViewedTabSelect={onViewedTabSelect}
            removeViewedTab={removeViewedTab}
            closeOtherViewedTabs={closeOtherViewedTabs}
            togglePinViewedTab={togglePinViewedTab}
            selectedApi={selectedApi}
            tsCodeParts={tsCodeParts}
            apiBaseUrl={apiBaseUrl}
            dashboard={
              <DocumentDashboard
                title={documentTitle}
                version={documentInfo.version}
                sourceText={documentSubtitle}
                mode={documentMode}
                saved={hasSavedCurrentDoc}
                apiCount={dashboardApiCount}
                groupCount={dashboardApiGroups.length}
                serviceCount={dashboardServices.length}
                localLibraryCount={savedExports.length}
                methodStats={methodStats}
                topGroups={topGroups}
                recentApis={recentApis}
                services={dashboardServices}
                onServiceSelect={handleServiceChange}
                onApiSelect={onViewedTabSelect}
              />
            }
            extensionChecking={checking}
            onRecheckExtension={recheckPlugin}
            onTryDemo={handleTryDemo}
            onBackHome={handleBackHome}
          />

          {/* 移动端接口导航：复用左侧导航内容，窄屏时通过抽屉打开。 */}
          <MobileNavDrawer
            open={mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
            scrollRequest={scrollRequest}
            apiGroups={apiGroups}
            onMenuSelect={onMenuSelect}
            handleGroupTitleClick={handleGroupTitleClick}
            handleToolbarSearchSelect={handleSearchSelect}
            currentServiceLabel={activeLocalService?.name || serviceOptions.find((item) => item.value === effectiveServiceUrl)?.label}
            allServiceGroups={isLocalMode ? localAllServiceGroups : remoteAllServiceGroups}
            allServiceSearchEnabled={isLocalMode ? localAllServiceGroups.length > 1 : serviceOptions.length > 1}
            allServiceLoadingText={!isLocalMode ? allServiceSearchLoadingText : undefined}
            allServiceError={!isLocalMode ? allServiceSearchError : undefined}
          />

          {/* 项目配置抽屉：控制 TypeScript 生成偏好。 */}
          <ProjectConfigDrawer
            open={configDrawerOpen}
            onClose={() => setConfigDrawerOpen(false)}
            configState={configState}
            setConfigState={setConfigState}
          />
        </div>
      ) : (
        /* 欢迎页：没有文档参数时，展示 Demo 入口、手动输入和扩展提示。 */
        <WelcomeView
          autoCompleteOptions={autoCompleteOptions}
          handleCommitIp={handleCommitIp}
          handleTryDemo={handleTryDemo}
          handleTryMultiServiceDemo={handleTryMultiServiceDemo}
          loading={loading}
          loadingFeedback={loadingFeedback}
          checking={checking}
          pluginStatus={pluginStatus}
          pluginEnabled={pluginEnabled}
          onRecheckPlugin={recheckPlugin}
          localLibraryCount={savedExports.length}
        />
      )}

      <RequestDebugPanel />

      {/* 全局本地接口库入口：不属于欢迎页内容，文档模式也能随时打开。 */}
      <LocalApiLibrary
        savedExports={savedExports}
        loading={libraryLoading}
        error={libraryError}
        importing={localLibraryImporting}
        onOpen={handleOpenLocalExport}
        onDownload={handleDownloadLocalExport}
        onDelete={(id) => void handleDeleteLocalExport(id)}
        onRename={handleRenameLocalExport}
        onImportFile={handleImportLocalExport}
      />

      {/* 搜索历史重命名弹窗：无论欢迎页还是文档模式，都可能从地址历史里触发。 */}
      <RenameHistoryModal
        open={!!renameTarget}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        confirmRename={confirmRename}
        onCancel={() => setRenameTarget(null)}
      />
    </>
  );
};

export default Home;
