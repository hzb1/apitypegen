import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import * as Sentry from "@sentry/react";
import packageJson from "../package.json";

import { createBrowserRouter, RouterProvider } from "react-router";

/** 浏览器 bundle 注入的 debug ID 注册表。 */
type SentryDebugIdGlobal = typeof globalThis & {
  /** 已加载 JavaScript bundle 的调用栈与 debug ID 映射。 */
  _sentryDebugIds?: Record<string, string>;
};

/**
 * 从 Sentry 注入的全局 debug ID 注册表生成事件元数据。
 * 某些 GlitchTip/Sentry 兼容组合不会自动将该注册表转换为 debug_meta，
 * 这里在发送前显式补齐，确保服务端可以按 debug ID 查找 sourcemap。
 */
function buildSentryDebugImages() {
  const debugIds = (globalThis as SentryDebugIdGlobal)._sentryDebugIds;
  if (!debugIds) return [];

  return Object.entries(debugIds).flatMap(([stack, debugId]) => {
    const filename = stack.match(/(?:\b at |@)(.*?):\d+:\d+$/m)?.[1];
    if (!filename) return [];
    return [{
      type: "sourcemap" as const,
      code_file: filename,
      debug_id: debugId,
    }];
  });
}

const router = createBrowserRouter(
  [
    {
      path: "/",
      lazy: async () => {
        const module = await import("./pages/AppRoot.tsx");
        return { Component: module.default };
      },
      children: [
        {
          index: true,
          lazy: async () => {
            const module = await import("./pages/home/Home.tsx");
            return { Component: module.default };
          },
        },
        {
          path: "proxy-fetch",
          lazy: async () => {
            const module = await import("./pages/proxy-fetch/ProxyFetchDemo.tsx");
            return { Component: module.default };
          },
        },
        {
          path: "network",
          lazy: async () => {
            const module = await import("./pages/network/NetworkPanel.tsx");
            return { Component: module.default };
          },
        },
        {
          path: "glitchtip",
          lazy: async () => {
            const module = await import("./pages/glitchtip/GlitchTipDebug.tsx");
            return { Component: module.default };
          },
        },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  },
);

const isProduction = import.meta.env.MODE === "production";

Sentry.init({
  dsn: import.meta.env.VITE_GLITCHTIP_DSN,
  environment: import.meta.env.MODE,
  release: packageJson.version,
  enabled: isProduction,
  tracesSampleRate: 0,
  beforeSend(event) {
    const debugImages = buildSentryDebugImages();
    if (debugImages.length > 0) {
      event.debug_meta = {
        ...event.debug_meta,
        images: [
          ...(event.debug_meta?.images ?? []),
          ...debugImages,
        ],
      };
    }
    return event;
  },
  // @ts-expect-error GlitchTip does not support sessions
  autoSessionTracking: false,
});


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
