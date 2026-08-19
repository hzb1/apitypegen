import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import * as Sentry from "@sentry/react";
import packageJson from "../package.json";

import { createBrowserRouter, RouterProvider } from "react-router";

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
  // @ts-expect-error GlitchTip does not support sessions
  autoSessionTracking: false,
});


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
