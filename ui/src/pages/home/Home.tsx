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
import type { SavedApiExport } from "./export/export.types.ts";
import { downloadTsSwaggerExport } from "./export/downloadJson.ts";
import { parseImportedApiExport } from "./export/importApiExport.ts";
import { saveApiExport } from "./export/localApiExportStore.ts";
import { useApiBaseUrl } from "./hooks/useApiBaseUrl.ts";
import { useHomeApiNavigation } from "./hooks/useHomeApiNavigation.ts";
import { useHomeDocumentState } from "./hooks/useHomeDocumentState.ts";
import { useHomeLoadingFeedback } from "./hooks/useHomeLoadingFeedback.ts";
import { useHomeTsCodeParts } from "./hooks/useHomeTsCodeParts.ts";
import { useLocalApiExports } from "./hooks/useLocalApiExports.ts";

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
  } = useDocSearchHistory();

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

  const isLocalMode = Boolean(localId);
  const localDocumentData = activeLocalExport?.payload.openapi as OpenAPI.Document | undefined;
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
    isDemoMode: isDemoMode || isLocalMode,
    setSearchParams,
  });

  /**
   * 已查看 Tabs：记录用户浏览过的 API，并支持关闭、固定和关闭其它。
   */
  const viewedContextKey = useMemo(
    () => (localId ? `local:${localId}` : `${ipFromUrl}__${serviceUrl ?? ""}`),
    [ipFromUrl, localId, serviceUrl],
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
    if (isLocalMode) return [];
    return configData?.urls.map((item) => ({
      label: item.name,
      value: item.url,
    })) || [];
  }, [configData?.urls, isLocalMode]);
  const localSourceDocUrl = activeLocalExport?.payload.source.docUrl || "";
  const sourceDocUrl = isLocalMode ? localSourceDocUrl : ipFromUrl;
  const derivedApiBaseUrl = useApiBaseUrl({
    documentData,
    normalizedDocInput: isLocalMode ? localSourceDocUrl : normalizedDocInput,
  });
  const apiBaseUrl = activeLocalExport?.payload.source.apiBaseUrl || derivedApiBaseUrl;
  const tsCodeParts = useHomeTsCodeParts({ documentData, selectedApi, generatorOptions });

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

  const handleImportLocalExport = useCallback(async (file: File) => {
    setLocalLibraryImporting(true);
    try {
      const fileText = await file.text();
      const imported = parseImportedApiExport(fileText, file.name, configState, generatorOptions);
      const result = await saveApiExport(imported.payload);
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
  }, [configState, generatorOptions, handleOpenLocalExport, refreshSavedExports]);

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
            inputIp={inputIp}
            setInputIp={setInputIp}
            autoCompleteOptions={autoCompleteOptions}
            handleCommitIp={handleCommitIp}
            loading={loading}
            loadingFeedback={loadingFeedback}
            serviceUrl={isLocalMode ? undefined : serviceUrl}
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
                serviceUrl={isLocalMode ? activeLocalExport?.payload.source.serviceUrl : serviceUrl}
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
            handleToolbarSearchSelect={handleToolbarSearchSelect}
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
            handleToolbarSearchSelect={handleToolbarSearchSelect}
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
