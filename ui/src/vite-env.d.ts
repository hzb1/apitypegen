/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROXY_EXTENSION_URL?: string;
  /** GlitchTip DSN */
  readonly VITE_GLITCHTIP_DSN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
