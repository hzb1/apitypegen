import { useState } from "react";
import { Button, message } from "antd";
import { DownloadOutlined, SaveOutlined } from "@ant-design/icons";
import type { OpenAPI } from "openapi-types";
import { proxyFetch } from "@extension/src/shared/proxySdk.ts";
import { buildApiGroups, buildGroupedApis } from "@/hooks/useApiNavigationData.ts";
import type { GeneratorOptions } from "@/utils/SwaggerParser.ts";
import type { ConfigState } from "@/hooks/useOptions.ts";
import type { ApiGroup } from "../utils.ts";
import { buildTsSwaggerExport } from "../export/exportApiData.ts";
import { downloadTsSwaggerExport } from "../export/downloadJson.ts";
import { saveApiExport } from "../export/localApiExportStore.ts";
import { getApiBaseUrl } from "../hooks/useApiBaseUrl.ts";
import type { SavedApiExport, TsSwaggerExport } from "../export/export.types.ts";
import { SHOW_JSON_IO } from "../home.constants.ts";

type ExportServiceOption = {
  label: string;
  value: string;
};

type ExportApiActionsProps = {
  documentData: OpenAPI.Document | null;
  apiGroups: ApiGroup[];
  apiBaseUrl: string;
  docUrl: string;
  documentBaseUrl?: string;
  serviceUrl?: string;
  serviceOptions?: ExportServiceOption[];
  pluginEnabled?: boolean;
  existingPayload?: TsSwaggerExport;
  saveName?: string;
  hasSavedCurrentDoc?: boolean;
  generatorConfig: ConfigState;
  generatorOptions: GeneratorOptions;
  onSaved?: (record: SavedApiExport) => void;
};

type SaveProgress = {
  current: number;
  total: number;
};

function normalizeBaseUrl(rawInput: string) {
  const value = rawInput.trim();
  if (!value) return "";
  if (/^https?:\/\//.test(value)) return value;
  if (value.startsWith("/")) {
    return new URL(value, window.location.origin).toString();
  }
  return `http://${value}`;
}

function joinUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//.test(path)) return path;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase).toString();
}

function isOpenApiLike(doc: unknown): doc is OpenAPI.Document {
  if (!doc || typeof doc !== "object") return false;
  const typed = doc as Record<string, unknown>;
  return Boolean(typed.openapi || typed.swagger || typed.paths);
}

function shouldUseNativeFetch(url: string, pluginEnabled?: boolean) {
  try {
    if (new URL(url).origin === window.location.origin) return true;
  } catch {
    return true;
  }
  return !pluginEnabled;
}

async function fetchOpenApiDocument(url: string, pluginEnabled?: boolean) {
  const response = shouldUseNativeFetch(url, pluginEnabled)
    ? await fetch(url)
    : await proxyFetch(url, { timeout: 10000 });
  if (!response.ok) {
    throw new Error(`加载 ${url} 失败：Status ${response.status}`);
  }
  const json = await response.json();
  if (!isOpenApiLike(json)) {
    throw new Error(`加载 ${url} 失败：文档格式不是 OpenAPI/Swagger`);
  }
  return json;
}

function buildSingleDocumentPayload(params: {
  documentData: OpenAPI.Document;
  apiGroups: ApiGroup[];
  apiBaseUrl: string;
  docUrl: string;
  serviceUrl?: string;
  generatorConfig: ConfigState;
  generatorOptions: GeneratorOptions;
}) {
  return buildTsSwaggerExport(params);
}

async function buildServicePayloads(
  props: ExportApiActionsProps,
  onProgress?: (progress: SaveProgress) => void,
) {
  const baseUrl = normalizeBaseUrl(props.documentBaseUrl || props.docUrl);
  const services = props.serviceOptions || [];
  const servicePayloads = [];

  for (const [index, service] of services.entries()) {
    const serviceDocumentUrl = joinUrl(baseUrl, service.value);
    let documentData: OpenAPI.Document;
    try {
      documentData = service.value === props.serviceUrl && props.documentData
        ? props.documentData
        : await fetchOpenApiDocument(serviceDocumentUrl, props.pluginEnabled);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      throw new Error(`${service.label} ${text}`);
    }
    const groupedApis = buildGroupedApis(documentData);
    const apiGroups = buildApiGroups({
      groupedApis,
      selectedApiKey: null,
      expandedGroupList: [],
    });
    const apiBaseUrl = getApiBaseUrl({
      documentData,
      normalizedDocInput: serviceDocumentUrl,
    });
    const payload = buildSingleDocumentPayload({
      documentData,
      apiGroups,
      apiBaseUrl,
      docUrl: props.docUrl,
      serviceUrl: service.value,
      generatorConfig: props.generatorConfig,
      generatorOptions: props.generatorOptions,
    });

    servicePayloads.push({
      service,
      payload,
      serviceExport: {
        name: service.label,
        url: service.value,
        apiBaseUrl,
        openapi: payload.openapi,
        groups: payload.groups,
        apis: payload.apis,
      },
    });
    onProgress?.({
      current: index + 1,
      total: services.length,
    });
  }

  return servicePayloads;
}

export async function buildCurrentExportPayload(
  props: ExportApiActionsProps,
  onProgress?: (progress: SaveProgress) => void,
): Promise<TsSwaggerExport | null> {
  if (props.existingPayload) {
    return props.existingPayload;
  }

  if (!props.documentData || props.apiGroups.every((group) => group.children.length === 0)) {
    return null;
  }

  if (props.serviceOptions?.length) {
    const servicePayloads = await buildServicePayloads(props, onProgress);
    if (!servicePayloads.length) return null;
    const primary = servicePayloads.find((item) => item.service.value === props.serviceUrl)
      ?? servicePayloads[0];
    return {
      ...primary.payload,
      exportedAt: new Date().toISOString(),
      services: servicePayloads.map((item) => item.serviceExport),
    };
  }

  return buildSingleDocumentPayload({
    documentData: props.documentData,
    apiGroups: props.apiGroups,
    apiBaseUrl: props.apiBaseUrl,
    docUrl: props.docUrl,
    serviceUrl: props.serviceUrl,
    generatorConfig: props.generatorConfig,
    generatorOptions: props.generatorOptions,
  });
}

export default function ExportApiActions(props: ExportApiActionsProps) {
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveProgress, setSaveProgress] = useState<SaveProgress | null>(null);
  const disabled = !props.existingPayload
    && (!props.documentData || props.apiGroups.every((group) => group.children.length === 0));

  const handleDownload = async () => {
    setExporting(true);
    try {
      const payload = await buildCurrentExportPayload(props);
      if (!payload) {
        message.warning("当前没有可导出的接口数据");
        return;
      }
      downloadTsSwaggerExport(payload);
      message.success("已导出 JSON 文件");
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      message.error(`导出失败：${text}`);
    } finally {
      setExporting(false);
    }
  };

  const handleSaveLocal = async () => {
    setSaving(true);
    setSaveProgress(null);
    try {
      const payload = await buildCurrentExportPayload(props, setSaveProgress);
      if (!payload) {
        message.warning("当前没有可保存的接口数据");
        return;
      }
      const result = await saveApiExport(payload, { name: props.saveName });
      props.onSaved?.(result.record);
      message.success(result.created ? "已保存到本地接口库" : "已更新本地接口库记录");
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      message.error(`保存失败：${text}`);
    } finally {
      setSaveProgress(null);
      setSaving(false);
    }
  };
  const saveButtonText = saving && saveProgress && saveProgress.total > 1
    ? `保存中 ${saveProgress.current}/${saveProgress.total}`
    : saving
      ? "保存中..."
    : props.hasSavedCurrentDoc ? "更新到本地" : "保存到本地";

  return (
    <>
      <Button
        type="default"
        icon={<SaveOutlined />}
        onClick={() => void handleSaveLocal()}
        loading={saving}
        disabled={disabled}
      >
        {saveButtonText}
      </Button>
      {SHOW_JSON_IO ? (
        <Button
          type="default"
          icon={<DownloadOutlined />}
          onClick={() => void handleDownload()}
          loading={exporting}
          disabled={disabled}
        >
          导出 JSON
        </Button>
      ) : null}
    </>
  );
}
