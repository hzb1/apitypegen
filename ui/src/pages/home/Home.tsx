import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  buildServiceDocumentUrl,
  fetchOpenApiDocument,
  normalizeDocumentBaseUrl,
} from "./serviceDocumentLoader.ts";

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
    handleOpenLocalExport,
    handleServiceChange,
  } = useHomeDocumentState();

  /**
   * 页面级弹层状态：配置抽屉属于首页局部 UI，不需要进入 URL。
   */
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false);
  const [localLibraryImporting, setLocalLibraryImporting] = useState(false);
  const allServiceSearchCacheRef = useRef<{
    key: string;
    data?: AllServiceSearchGroup[];
    promise?: Promise<AllServiceSearchGroup[]>;
  } | null>(null);

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
    documentData: remoteDocumentData,
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
  const localDocumentData = (activeLocalService?.openapi ?? activeLocalExport?.payload.openapi) as
    | OpenAPI.Document
    | undefined;
  const documentData = isLocalMode ? (localDocumentData ?? null) : remoteDocumentData;
  const activeError = isLocalMode ? localActiveError : error;
  const activeErrorDetail = isLocalMode
    ? (localActiveError ? { message: localActiveError } : null)
    : errorDetail;

  /**
   * 加载态与生成配置：配置会直接影响右侧 TypeScript 输出。
   */
  const remoteLoading = stage === "probe" || stage === "config" || stage === "document";
  const loading = isLocalMode ? activeLoading : remoteLoading;
  const configLoading = !isLocalMode && stage === "config";
  const contentLoading = hasDocumentSource && !activeError && (loading || !documentData);
  const remoteLoadingFeedback = useHomeLoadingFeedback(stage);
  const loadingFeedback = isLocalMode && activeLoading
    ? {
      title: "正在打开本地文档",
      button: "读取本地...",
      text: "正在从浏览器本地库读取接口数据",
    }
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
      : `${ipFromUrl}__${serviceUrl ?? ""}`),
    [activeLocalService?.url, ipFromUrl, localId, serviceUrl],
  );
  const handleSelectApi = useCallback((nextApiKey?: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextApiKey) {
        next.set("api", nextApiKey);
      } else {
        next.delete("api");
      }
      return next;
    });
  }, [setSearchParams]);
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
  const derivedApiBaseUrl = useApiBaseUrl({
    documentData,
    normalizedDocInput: isLocalMode ? localSourceDocUrl : normalizedDocInput,
  });
  const apiBaseUrl = activeLocalService?.apiBaseUrl
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
  const apiCount = apiGroups.reduce((total, group) => total + group.children.length, 0);
  const methodStats = useMemo(() => {
    const stats = new Map<string, number>();
    apiGroups.forEach((group) => {
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
  }, [apiGroups]);
  const topGroups = useMemo(() => (
    apiGroups
      .map((group) => ({ name: group.name, count: group.children.length }))
      .filter((group) => group.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  ), [apiGroups]);
  const dashboardServices: DashboardServiceItem[] = useMemo(() => {
    if (localServices?.length) {
      return localServices.map((service) => ({
        name: service.name,
        value: service.url,
        apiCount: service.apis.length,
        isActive: service.url === activeLocalService?.url,
      }));
    }
    if (serviceOptions.length) {
      return serviceOptions.map((service) => ({
        name: service.label,
        value: service.value,
        apiCount: service.value === serviceUrl ? apiCount : undefined,
        isActive: service.value === serviceUrl,
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
    apiCount,
    documentData,
    documentTitle,
    localServices,
    serviceOptions,
    serviceUrl,
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
  const allServiceSearchCacheKey = useMemo(
    () => `${normalizedDocInput}__${serviceOptions.map((item) => `${item.label}:${item.value}`).join("|")}`,
    [normalizedDocInput, serviceOptions],
  );
  const loadAllServiceGroups = useCallback(async (): Promise<AllServiceSearchGroup[]> => {
    if (!serviceOptions.length) return [];
    const cached = allServiceSearchCacheRef.current;
    if (cached?.key === allServiceSearchCacheKey) {
      if (cached.data) return cached.data;
      if (cached.promise) return cached.promise;
    }

    const baseUrl = normalizeDocumentBaseUrl(normalizedDocInput || sourceDocUrl);
    const promise = Promise.all(serviceOptions.map(async (service) => {
      try {
        const doc = service.value === serviceUrl && documentData
          ? documentData
          : await fetchOpenApiDocument(
            buildServiceDocumentUrl(baseUrl, service.value),
            pluginEnabled,
          );
        return {
          serviceName: service.label,
          serviceValue: service.value,
          groups: buildSearchGroupsFromDocument({
            documentData: doc,
            selectedApiKey: service.value === serviceUrl ? selectedApiKey : null,
          }),
        };
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        throw new Error(`${service.label} ${text}`);
      }
    }));

    allServiceSearchCacheRef.current = {
      key: allServiceSearchCacheKey,
      promise,
    };
    const data = await promise;
    allServiceSearchCacheRef.current = {
      key: allServiceSearchCacheKey,
      data,
    };
    return data;
  }, [
    allServiceSearchCacheKey,
    documentData,
    normalizedDocInput,
    pluginEnabled,
    selectedApiKey,
    serviceOptions,
    serviceUrl,
    sourceDocUrl,
  ]);
  const handleSearchSelect = useCallback((key: string, context?: SearchResultSelectContext) => {
    if (context?.serviceValue && context.serviceValue !== serviceUrl) {
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
  }, [handleToolbarSearchSelect, serviceUrl, setMobileNavOpen, setSearchParams]);

  useEffect(() => {
    if (!remoteDocumentData || isLocalMode) return;
    recordSearchOnce(ipFromUrl);
  }, [isLocalMode, ipFromUrl, recordSearchOnce, remoteDocumentData]);

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
            }}
            inputIp={inputIp}
            setInputIp={setInputIp}
            autoCompleteOptions={autoCompleteOptions}
            handleCommitIp={handleCommitIp}
            loading={loading}
            loadingFeedback={loadingFeedback}
            serviceUrl={isLocalMode ? activeLocalService?.url : serviceUrl}
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
                serviceUrl={isLocalMode ? activeLocalService?.url : serviceUrl}
                serviceOptions={!isLocalMode ? serviceOptions : undefined}
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
            currentServiceLabel={activeLocalService?.name || serviceOptions.find((item) => item.value === serviceUrl)?.label}
            allServiceGroups={isLocalMode ? localAllServiceGroups : undefined}
            loadAllServiceGroups={!isLocalMode && serviceOptions.length > 1 ? loadAllServiceGroups : undefined}
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
                apiCount={apiCount}
                groupCount={apiGroups.length}
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
            currentServiceLabel={activeLocalService?.name || serviceOptions.find((item) => item.value === serviceUrl)?.label}
            allServiceGroups={isLocalMode ? localAllServiceGroups : undefined}
            loadAllServiceGroups={!isLocalMode && serviceOptions.length > 1 ? loadAllServiceGroups : undefined}
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
