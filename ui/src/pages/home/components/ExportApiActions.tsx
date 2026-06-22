import { useState } from "react";
import { Button, message } from "antd";
import { DownloadOutlined, SaveOutlined } from "@ant-design/icons";
import type { OpenAPI } from "openapi-types";
import type { GeneratorOptions } from "@/utils/SwaggerParser.ts";
import type { ConfigState } from "@/hooks/useOptions.ts";
import type { ApiGroup } from "../utils.ts";
import { buildTsSwaggerExport } from "../export/exportApiData.ts";
import { downloadTsSwaggerExport } from "../export/downloadJson.ts";
import { saveApiExport } from "../export/localApiExportStore.ts";
import type { SavedApiExport, TsSwaggerExport } from "../export/export.types.ts";

type ExportApiActionsProps = {
  documentData: OpenAPI.Document | null;
  apiGroups: ApiGroup[];
  apiBaseUrl: string;
  docUrl: string;
  serviceUrl?: string;
  generatorConfig: ConfigState;
  generatorOptions: GeneratorOptions;
  onSaved?: (record: SavedApiExport) => void;
};

export function buildCurrentExportPayload(props: ExportApiActionsProps): TsSwaggerExport | null {
  if (!props.documentData || props.apiGroups.every((group) => group.children.length === 0)) {
    return null;
  }

  return buildTsSwaggerExport({
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
  const disabled = !props.documentData || props.apiGroups.every((group) => group.children.length === 0);

  const handleDownload = () => {
    setExporting(true);
    try {
      const payload = buildCurrentExportPayload(props);
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
    try {
      const payload = buildCurrentExportPayload(props);
      if (!payload) {
        message.warning("当前没有可保存的接口数据");
        return;
      }
      const result = await saveApiExport(payload);
      props.onSaved?.(result.record);
      message.success(result.created ? "已保存到本地接口库" : "已更新本地接口库记录");
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      message.error(`保存失败：${text}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="default"
        icon={<SaveOutlined />}
        onClick={() => void handleSaveLocal()}
        loading={saving}
        disabled={disabled}
      >
        保存到本地
      </Button>
      <Button
        type="default"
        icon={<DownloadOutlined />}
        onClick={handleDownload}
        loading={exporting}
        disabled={disabled}
      >
        导出 JSON
      </Button>
    </>
  );
}
