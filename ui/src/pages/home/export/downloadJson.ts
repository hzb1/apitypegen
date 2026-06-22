import type { TsSwaggerExport } from "./export.types.ts";

function sanitizeFilePart(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function createExportFileName(payload: TsSwaggerExport) {
  const title = sanitizeFilePart(payload.source.title || "api-export") || "api-export";
  const date = payload.exportedAt.slice(0, 10);
  return `ts-swagger-${title}-${date}.json`;
}

export function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadTsSwaggerExport(payload: TsSwaggerExport) {
  downloadJson(payload, createExportFileName(payload));
}
