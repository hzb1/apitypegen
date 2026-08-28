export const APP_VERSION = "0.5.2";

export const SHOW_JSON_IO = false;

export const EXTENSION_URL =
  (import.meta.env.VITE_PROXY_EXTENSION_URL as string | undefined) ??
  "https://swagger.huzhibin.top/downloads/apitypegen-extension-dist-latest.zip";

export const DEMO_DOC_PATH = "/demo/openapi.json";
export const DEMO_SWAGGER_CONFIG_PATH = "/demo/swagger-config.json";

export const isDemoDocInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === DEMO_DOC_PATH) return true;
  if (trimmed === DEMO_SWAGGER_CONFIG_PATH) return true;
  return trimmed === new URL(DEMO_DOC_PATH, window.location.origin).toString()
    || trimmed === new URL(DEMO_SWAGGER_CONFIG_PATH, window.location.origin).toString();
};
