import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StyleProvider } from "@ant-design/cssinjs";
import { ConfigProvider } from "antd";
import "./index.css";

import "dayjs/locale/zh-cn";

import zhCN from "antd/locale/zh_CN";
import { createBrowserRouter, RouterProvider } from "react-router";

const router = createBrowserRouter(
  [
    {
      path: "/",
      lazy: async () => {
        const module = await import("./pages/home/Home.tsx");
        return { Component: module.default };
      },
    },
    {
      path: "/proxy-fetch",
      lazy: async () => {
        const module = await import("./pages/proxy-fetch/ProxyFetchDemo.tsx");
        return { Component: module.default };
      },
    },
    {
      path: "/network",
      lazy: async () => {
        const module = await import("./pages/network/NetworkPanel.tsx");
        return { Component: module.default };
      },
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StyleProvider hashPriority="high" layer>
      <ConfigProvider locale={zhCN}>
        <RouterProvider router={router} />
      </ConfigProvider>
    </StyleProvider>
  </StrictMode>,
);
