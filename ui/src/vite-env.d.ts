/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROXY_EXTENSION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
