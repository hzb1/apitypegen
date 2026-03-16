import React from "react";
import { StyleProvider } from "@ant-design/cssinjs";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Outlet } from "react-router";
import { ThemeProvider } from "@/theme/ThemeProvider.tsx";
import { useTheme } from "@/theme/useTheme.ts";

import "dayjs/locale/zh-cn";

const AppRootInner: React.FC = () => {
  const { antdThemeConfig } = useTheme();

  return (
    <ConfigProvider locale={zhCN} theme={antdThemeConfig}>
      <Outlet />
    </ConfigProvider>
  );
};

const AppRoot: React.FC = () => {
  return (
    <StyleProvider hashPriority="high" layer>
      <ThemeProvider>
        <AppRootInner />
      </ThemeProvider>
    </StyleProvider>
  );
};

export default AppRoot;
