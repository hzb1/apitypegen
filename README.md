# ts-swagger

## 1. 项目介绍

这是一个 TS 和 Swagger 结合的接口文档，直接输出可用的 TypeScript 类型与请求结构

## 2. 特点

- 面向前端：从 OpenAPI/Swagger 文档直接生成并展示 TypeScript 类型
- 复制即用：代码高亮 + 一键复制，减少手写类型和低级错误
- 兼容 Swagger v2/v3：适配常见后端文档输出格式
- 调试友好：通过浏览器扩展代理请求，缓解浏览器跨域限制

## 3. 开发环境（Node 版本）

- 项目通过根目录 `.nvmrc` 固定 Node 版本为 `22.16.0`。
- 首次进入项目建议执行：

```bash
nvm install
nvm use
```

## 4. FAQ / 排障

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

## 5. CLI（给 AI/脚本调用）

项目根目录提供了 `ts-swagger` 命令，支持列服务、检索接口、按接口生成 TypeScript。

### 5.1 安装 / 使用

本项目内开发时可直接运行：

```bash
npm run ts-swagger -- --help
npm run ts-swagger -- services --host http://localhost:9966
npm run ts-swagger -- gen --host http://localhost:9966 --service 用户服务 --method post --path /api/order/create
```

本机日常使用可以通过 `npm link` 注册全局命令：

```bash
npm link
ts-swagger --help
ts-swagger services --host http://localhost:9966
```

发布到 npm 后，可通过全局安装使用：

```bash
npm install -g ts-swagger
ts-swagger gen --host http://localhost:9966 --service 用户服务 --method post --path /api/order/create
```

### 5.2 可选配置

`ts-swagger.config.json` 不是必需文件。它适合放本机常用 host 和生成偏好，已被 `.gitignore` 忽略。

如果希望少传 `--host`，可以参考 `ts-swagger.config.example.json` 新建本地配置：

```json
{
  "host": "http://localhost:9966",
  "version": "v3"
}
```

host 优先级：`--host` > `TS_SWAGGER_HOST` > `ts-swagger.config.json`。
如果三者都没有，CLI 会直接报错提示。

也可以不用配置文件，改用环境变量：

```bash
export TS_SWAGGER_HOST=http://localhost:9966
ts-swagger services
```

### 5.3 常用命令

```bash
# 列出 swagger-config 服务
npm run ts-swagger -- services --host http://localhost:9966

# 搜索接口
npm run ts-swagger -- search --host http://localhost:9966 --keyword order --service 用户服务

# 生成 TS（默认输出文本）
npm run ts-swagger -- gen --host http://localhost:9966 --method post --path /api/order/create --service 用户服务

# 生成 TS 并复制到剪切板
npm run ts-swagger -- gen --host http://localhost:9966 --method post --path /api/order/create --service 用户服务 --copy

# 直接使用文档 URL（跳过 swagger-config / service）
npm run ts-swagger -- gen --doc-url http://localhost:3000/docs/json --method post --path /api/showcase/v1/users  --copy
```

### 5.4 服务参数行为

- `--service` 非必填：
- 如果只有一个服务，自动选择。
- 如果有多个服务且当前终端是交互模式（TTY），CLI 会提示选择。
- 如果有多个服务但在非交互模式（例如 AI/脚本）下运行，会报错并列出可选服务名。
