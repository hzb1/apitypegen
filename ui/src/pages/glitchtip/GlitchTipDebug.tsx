import React, { useCallback, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Row,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  BugOutlined,
  HomeOutlined,
  MessageOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import * as Sentry from "@sentry/react";
import { Link } from "react-router";
import "./GlitchTipDebug.css";

const { Title, Paragraph, Text } = Typography;

const GlitchTipDebug: React.FC = () => {
  const [lastResult, setLastResult] = useState("还没有触发测试事件");
  const isProduction = import.meta.env.MODE === "production";

  const showEventResult = useCallback((label: string, eventId: string | undefined) => {
    setLastResult(`${label}：已调用 GlitchTip${eventId ? `（event id: ${eventId}）` : ""}`);
  }, []);

  const captureException = useCallback(() => {
    const eventId = Sentry.captureException(
      new Error("GlitchTip debug: captured exception"),
    );
    showEventResult("手动异常", eventId);
  }, [showEventResult]);

  const captureMessage = useCallback(() => {
    const eventId = Sentry.captureMessage(
      "GlitchTip debug: captured message",
      "info",
    );
    showEventResult("普通消息", eventId);
  }, [showEventResult]);

  const captureWithBreadcrumb = useCallback(() => {
    Sentry.addBreadcrumb({
      category: "glitchtip-debug",
      message: "用户点击了带 breadcrumb 的异常测试",
      level: "info",
      data: { source: "GlitchTipDebug" },
    });
    const eventId = Sentry.captureException(
      new Error("GlitchTip debug: exception with breadcrumb"),
    );
    showEventResult("Breadcrumb + 异常", eventId);
  }, [showEventResult]);

  const captureNestedException = useCallback(() => {
    const cause = new Error("GlitchTip debug: root cause");
    const error = new Error("GlitchTip debug: nested exception");
    error.cause = cause;
    const eventId = Sentry.captureException(error);
    showEventResult("嵌套异常", eventId);
  }, [showEventResult]);

  const triggerUnhandledRejection = useCallback(() => {
    setLastResult("未处理 Promise rejection 已触发，等待浏览器全局捕获");
    window.setTimeout(() => {
      void Promise.reject(new Error("GlitchTip debug: unhandled promise rejection"));
    }, 0);
  }, []);

  const triggerUncaughtException = useCallback(() => {
    setLastResult("未捕获同步异常已触发，等待浏览器全局捕获");
    window.setTimeout(() => {
      throw new Error("GlitchTip debug: uncaught asynchronous exception");
    }, 0);
  }, []);

  const capturePerformance = useCallback(() => {
    Sentry.startSpan(
      { name: "GlitchTip debug span", op: "debug.test" },
      () => {
        const eventId = Sentry.captureMessage(
          "GlitchTip debug: message inside performance span",
          "info",
        );
        showEventResult("性能 Span + 消息", eventId);
      },
    );
  }, [showEventResult]);

  return (
    <main className="glitchtip-page">
      <section className="glitchtip-hero">
        <div>
          <Space size={10} align="center">
            <BugOutlined className="glitchtip-hero-icon" />
            <Title level={2} className="glitchtip-title">GlitchTip 调试中心</Title>
          </Space>
          <Paragraph className="glitchtip-subtitle">
            在这里触发浏览器端常见的错误和事件，验证 Sentry SDK、release 与 sourcemap 是否配置正确。
          </Paragraph>
        </div>
        <Button icon={<HomeOutlined />}>
          <Link to="/">返回首页</Link>
        </Button>
      </section>

      <Alert
        className="glitchtip-status"
        type={isProduction ? "success" : "warning"}
        showIcon
        message={isProduction ? "当前为生产模式，Sentry 上报已启用" : "当前为开发模式，Sentry 上报未启用"}
        description={isProduction
          ? "点击测试按钮后，请到 GlitchTip 项目中查看事件详情和堆栈映射。"
          : "Vite 开发模式下页面不会发送事件；请使用 npm run build:glitchtip 构建后通过生产地址测试。"}
      />

      <Row gutter={[16, 16]} className="glitchtip-grid">
        <Col xs={24} md={12} lg={8}>
          <Card title="手动捕获" className="glitchtip-card">
            <Paragraph>使用 SDK 主动上报最常见的异常和消息。</Paragraph>
            <Space wrap>
              <Button type="primary" icon={<BugOutlined />} onClick={captureException}>captureException</Button>
              <Button icon={<MessageOutlined />} onClick={captureMessage}>captureMessage</Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Card title="上下文信息" className="glitchtip-card">
            <Paragraph>测试 breadcrumb、错误 cause 等上下文是否进入事件。</Paragraph>
            <Space wrap>
              <Button onClick={captureWithBreadcrumb}>Breadcrumb + 异常</Button>
              <Button onClick={captureNestedException}>嵌套异常</Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Card title="性能与链路" className="glitchtip-card">
            <Paragraph>在一个性能 Span 内发送消息，验证性能事件关联。</Paragraph>
            <Button icon={<ThunderboltOutlined />} onClick={capturePerformance}>测试性能 Span</Button>
          </Card>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Card title="全局异常" className="glitchtip-card glitchtip-card-danger">
            <Paragraph>通过浏览器全局监听器测试未处理异常。触发后页面可能被开发工具标记为异常。</Paragraph>
            <Space wrap>
              <Button danger icon={<WarningOutlined />} onClick={triggerUnhandledRejection}>未处理 Promise</Button>
              <Button danger onClick={triggerUncaughtException}>未捕获异常</Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Divider />
      <section className="glitchtip-result" aria-live="polite">
        <Text type="secondary">最近一次操作</Text>
        <div className="glitchtip-result-value">{lastResult}</div>
        <Tag color={isProduction ? "green" : "orange"}>
          {isProduction ? "Sentry enabled" : "Sentry disabled in development"}
        </Tag>
      </section>
    </main>
  );
};

export default GlitchTipDebug;
