import React from "react";
import { StyleProvider } from "@ant-design/cssinjs";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Outlet } from "react-router";

import "dayjs/locale/zh-cn";

const AppRoot: React.FC = () => {
  return (
    <StyleProvider hashPriority="high" layer>
      <ConfigProvider locale={zhCN}>
        <Outlet />
      </ConfigProvider>
    </StyleProvider>
  );
};

export default AppRoot;
