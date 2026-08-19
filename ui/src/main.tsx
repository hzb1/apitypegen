import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import * as Sentry from "@sentry/react";

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
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  },
);

Sentry.init({
  dsn: "https://20a68c8cc61f48568e74830e4e292f99@monitor.huzhibin.top/1",
  environment: 'production',
  tracesSampleRate: 0.01, // 1% of transactions — adjust to your needs
  autoSessionTracking: false, // GlitchTip does not support sessions
});


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
