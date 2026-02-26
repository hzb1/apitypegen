# ts-swagger

## 1. 项目介绍

面向前端工程师的 Swagger 接口文档，直接输出可用的 TypeScript 类型与请求结构

## 2. 特点

- 面向前端：从 OpenAPI/Swagger 文档直接生成并展示 TypeScript 类型
- 复制即用：代码高亮 + 一键复制，减少手写类型和低级错误
- 兼容 Swagger v2/v3：适配常见后端文档输出格式
- 调试友好：通过浏览器扩展代理请求，缓解浏览器跨域限制

## 3. FAQ / 排障

### Q1: 页面提示插件未启用怎么办？

- 确认已在 Chrome 开启“开发者模式”。
- 确认已加载 `extension/dist` 目录。
- 刷新页面后重试。

### Q2: 为什么接口请求失败或超时？

- 检查输入的 `ip` / 服务地址是否可访问。
- 确认目标服务 Swagger 路径可用（如 `/v3/api-docs/swagger-config`）。
- 查看网络面板（`/network`）定位是连接失败、超时还是返回异常状态码。

### Q3: 为什么没有看到 TypeScript 输出？

- 确认 Swagger 文档成功加载。
- 先在左侧选择一个具体 API。
- 若文档字段不规范（缺少 schema/response 定义），部分类型可能退化为 `any`。
