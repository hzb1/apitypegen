export const APP_VERSION = "0.5.1";

export const EXTENSION_URL =
  (import.meta.env.VITE_PROXY_EXTENSION_URL as string | undefined) ??
  "https://swagger.huzhibin.top/downloads/ts-swagger-extension-dist-latest.zip";

export const DEMO_DOC_PATH = "/demo/openapi.json";

export const isDemoDocInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === DEMO_DOC_PATH) return true;
  return trimmed === new URL(DEMO_DOC_PATH, window.location.origin).toString();
};
