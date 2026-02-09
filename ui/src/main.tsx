import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StyleProvider } from "@ant-design/cssinjs";
import "./index.css";
import Home from "./pages/home/Home.tsx";
import ProxyFetchDemo from "./pages/proxy-fetch/ProxyFetchDemo.tsx";

import "dayjs/locale/zh-cn";

import zhCN from "antd/locale/zh_CN";

import { ConfigProvider } from "antd";
import { createBrowserRouter, RouterProvider } from "react-router";

const router = createBrowserRouter([
  {
    path: "/",
    Component: Home,
    // loader: loadRootData,
  },
  {
    path: "/proxy-fetch",
    Component: ProxyFetchDemo,
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StyleProvider hashPriority="high" layer>
      <ConfigProvider locale={zhCN}>
        <RouterProvider router={router} />
      </ConfigProvider>
    </StyleProvider>
  </StrictMode>,
);
