# ts-swagger

## 1. 项目介绍

这是一个 TS 和 Swagger 结合的接口文档，直接输出可用的 TypeScript 类型与请求结构

## 2. 特点

- 面向前端：从 OpenAPI/Swagger 文档直接生成并展示 TypeScript 类型
- 复制即用：代码高亮 + 一键复制，减少手写类型和低级错误
- 兼容 Swagger v2/v3：适配常见后端文档输出格式
- 调试友好：通过浏览器扩展代理请求，缓解浏览器跨域限制
- 零门槛体验：v0.4.0 起内置本地 Demo，未安装扩展也能体验接口浏览、搜索和类型生成
- 本地接口库：v0.5.0 起支持保存到浏览器本地库，也可导出完整 JSON 数据包
- 无扩展引导：v0.5.1 起未安装扩展时会明确展示可用能力、安装入口和失败诊断
- JSON 导入：v0.5.2 起可导入 ts-swagger 导出包或普通 OpenAPI/Swagger JSON 到本地接口库

## 3. 3 分钟快速开始

Web UI 是最适合首次体验的入口。进入 `ui` 目录启动开发服务：

```bash
cd ui
npm install
npm run dev
```

打开页面后点击“试用示例项目”，系统会加载内置的 `/demo/openapi.json`。这个示例文档不依赖后端服务，也不需要安装浏览器扩展。

如果想体验 `swagger-config` 多服务切换，可以点击“多服务示例”，或手动输入 `/demo/swagger-config.json`。这个示例会加载用户服务、订单服务、库存服务 3 个本地 OpenAPI 文档，用来验证顶部服务下拉、全服务搜索和保存全部服务流程。

你可以在示例项目中完成这些操作：

- 浏览接口分组和接口详情
- 搜索接口
- 查看 Query Params、Request Body、Response Data 和 Models
- 一键复制生成的 TypeScript 类型
- 点击“保存到本地”，下次从首页的“本地保存的接口文档”继续打开

## 4. 本地接口库与 JSON 导出

v0.5.0 增加了“本地接口库 + JSON 导出”闭环。v0.5.2 进一步支持从本地 JSON 文件导入到接口库。加载任意文档后，可以在顶部栏使用：

- `保存到本地`：保存到当前浏览器当前站点的本地接口库。
- `导出 JSON`：下载 `ts-swagger-{title}-{YYYY-MM-DD}.json` 文件。

导出的 JSON 数据包包含原始 OpenAPI 文档、接口分组、接口列表、完整 URL、TypeScript 代码片段、来源信息、生成配置和导出时间。适合备份、传给同事或后续导入/分析。

本地接口库说明：

- 首页提供“本地接口库”管理入口，支持导入、打开、再次导出和删除。
- `导入 JSON` 支持 ts-swagger 导出的 JSON，也支持普通 OpenAPI/Swagger JSON；导入成功后会保存到 IndexedDB 并自动打开。
- 打开本地记录时使用 `?local=<id>`，不请求后端，也不依赖浏览器扩展。
- 保存范围按浏览器 origin 隔离，例如 `http://localhost:5173` 和 `https://example.com` 是两份不同数据。
- 清理浏览器站点数据会删除本地接口库；它不会跨浏览器、跨设备同步。
- 相同 `docUrl + serviceUrl + OpenAPI 内容` 会更新原记录，不会重复新增；同一 URL 的文档内容变化会保存为新记录。

## 5. 哪些功能需要扩展？

不需要浏览器扩展：

- 本地 Demo 文档
- 同源 OpenAPI/Swagger 文档
- 接口浏览和搜索
- TypeScript 类型生成
- 复制代码
- 保存到本地、打开本地接口库、导出 JSON

需要浏览器扩展：

- 加载内网 Swagger 地址
- 加载被 CORS 限制的后端文档
- 代理请求真实接口
- 使用网络调试面板发送跨域请求

v0.4.0 是第一个“无后端、无扩展也可体验”的版本。浏览器扩展仍然是跨域和真实请求调试的增强能力，但不再是体验产品核心价值的前置条件。
v0.5.0 进一步补上“离线继续查看”的能力：保存过的接口文档可以直接从浏览器本地库打开。
v0.5.1 优化了未安装扩展时的体验：外部文档会先尝试原生 `fetch`，同源或允许 CORS 的文档可直接加载；如果浏览器无法读取跨域/内网地址，页面会提示安装扩展、重新检测或先试用 Demo。
v0.5.2 支持从本地 JSON 导入接口数据，导入后会保存到浏览器本地库并自动进入本地文档模式。

### 未安装扩展时怎么体验？

- 打开首页，点击“试用示例项目”。
- 或输入同源 OpenAPI/Swagger JSON 地址，例如当前站点下的 `/demo/openapi.json`。
- 已保存到本地接口库的文档可以直接打开，不需要后端或扩展。
- 网络调试页中，原生 `fetch` 模式仍可尝试；`proxyFetch` 模式需要扩展。

### 为什么真实 Swagger 地址会失败？

浏览器原生请求受同源策略限制。若目标 Swagger 在内网、跨域且未开放 CORS，或 HTTPS 证书异常，页面无法直接读取；安装浏览器扩展后可以通过扩展代理访问这些文档。

## 6. 开发环境（Node 版本）

- 项目通过根目录 `.nvmrc` 固定 Node 版本为 `22.16.0`。
- 首次进入项目建议执行：

```bash
nvm install
nvm use
```

## 7. FAQ / 排障

### Q1: 页面提示插件未启用怎么办？

- 如果只是体验示例项目，可以忽略该提示，点击“试用示例项目”即可。
- 如果需要加载内网/跨域 Swagger 或代理真实请求，请确认已在 Chrome 开启“开发者模式”。
- 确认已加载 `extension/dist` 目录，或下载最新扩展压缩包并解压加载。
- 刷新页面后重试。

### Q2: 为什么接口请求失败或超时？

- 检查输入的 `ip` / 服务地址是否可访问。
- 确认目标服务 Swagger 路径可用（如 `/v3/api-docs/swagger-config`）。
- 查看网络面板（`/network`）定位是连接失败、超时还是返回异常状态码。

### Q3: 为什么没有看到 TypeScript 输出？

- 确认 Swagger 文档成功加载。
- 先在左侧选择一个具体 API。
- 若文档字段不规范（缺少 schema/response 定义），部分类型可能退化为 `any`。

## 8. CLI（给 AI/脚本调用）

项目根目录提供了 `ts-swagger` 命令，支持列服务、检索接口、按接口生成 TypeScript。

### 8.1 安装 / 使用

本项目内开发时可直接运行：

```bash
npm run ts-swagger -- --help
npm run ts-swagger -- services --type config --url http://localhost:9999/v3/api-docs/swagger-config
npm run ts-swagger -- gen
npm run ts-swagger -- gen --type openapi --url http://localhost:9999/job/v3/api-docs --method post --path /api/order/create
```

本机日常使用可以通过 `npm link` 注册全局命令：

```bash
npm link
ts-swagger --help
ts-swagger services --type config --url http://localhost:9999/v3/api-docs/swagger-config
```

发布到 npm 后，可通过全局安装使用：

```bash
npm install -g ts-swagger
ts-swagger gen --type ui --url http://localhost:9999/doc.html#/home
```

### 8.2 可选配置

`ts-swagger.config.json` 不是必需文件。它适合保存常用文档来源和生成偏好，已被 `.gitignore` 忽略。

可以参考 `ts-swagger.config.example.json` 新建本地配置：

```json
{
  "source": {
    "type": "ui",
    "url": "http://localhost:9999/doc.html#/home"
  }
}
```

来源优先级：`--type/--url` > `TS_SWAGGER_TYPE/TS_SWAGGER_URL` > `ts-swagger.config.json.source`。
如果均未提供，交互终端会先询问来源类型和地址，非交互终端会直接报错。

也可以不用配置文件，改用环境变量：

```bash
export TS_SWAGGER_TYPE=config
export TS_SWAGGER_URL=http://localhost:9999/v3/api-docs/swagger-config
ts-swagger services
```

### 8.3 常用命令

```bash
# 交互式生成（逐步选择来源、服务和 API）
npm run ts-swagger -- gen

# 从 Knife4j / Swagger UI 页面真实网络响应中发现服务
npm run ts-swagger -- services --type ui --url http://localhost:9999/doc.html#/home

# 从明确的 swagger-config 搜索接口
npm run ts-swagger -- search --type config --url http://localhost:9999/v3/api-docs/swagger-config --keyword order --service 用户服务

# 从明确的 OpenAPI JSON 生成 TS
npm run ts-swagger -- gen --type openapi --url http://localhost:9999/job/v3/api-docs --method post --path /api/order/create

# 生成 TS 并复制到剪切板
npm run ts-swagger -- gen --type openapi --url http://localhost:9999/job/v3/api-docs --method post --path /api/order/create --copy

# 在 AI / CI 中禁用交互（缺参数直接报错）
npm run ts-swagger -- gen --no-interactive --type openapi --url http://localhost:9999/job/v3/api-docs --method post --path /api/order/create
```

CLI 只支持三种明确来源：

- `ui`：启动系统 Chrome，加载 Swagger UI / Knife4j 页面，只读取页面真实发出的 GET 响应。
- `openapi`：地址必须直接返回 OpenAPI / Swagger JSON。
- `config`：地址必须直接返回 swagger-config JSON。

CLI 不会枚举、探测或猜测 OpenAPI 地址。`ui` 模式需要系统 Chrome；非标准安装位置可使用 `--chrome-path` 或 `TS_SWAGGER_CHROME_PATH` 指定。

### 8.4 服务参数行为

- `--service` 非必填：
- 如果只有一个服务，自动选择。
- 如果有多个服务且当前终端是交互模式（TTY），CLI 会提示选择。
- 如果有多个服务但在非交互模式（例如 AI/脚本）下运行，会报错并列出可选服务名。

### 8.5 gen 交互行为

- 在交互终端中执行 `ts-swagger gen`，可不传 `--type` / `--url` / `--service` / `--method` / `--path`，CLI 会逐步提问。
- 先选择 `Swagger UI / Knife4j 页面`、`OpenAPI JSON` 或 `swagger-config JSON`，再输入对应地址。
- UI 来源通过系统 Chrome 读取页面真实 GET 响应，不会检查页面源码或尝试候选路径。
- 若来源是 swagger-config 且服务多于一个，会提示选择服务。
- 然后通过关键词筛选并选择接口。
- 最后可选择输出格式（TypeScript / JSON）及是否复制到剪贴板。

## 9. GlitchTip sourcemap

UI 生产构建会在 `ui/dist` 中生成 sourcemap。首次使用前需安装 `@sentry/cli`，并准备好 GlitchTip API token：

```bash
npm install --save-dev @sentry/cli
```

复制根目录的配置模板，并填入新生成的 API Token：

```bash
cp .env.glitchtip.example .env.glitchtip.local
```

`.env.glitchtip.local` 只用于本地 sourcemap 上传和部署，已加入 `.gitignore`。前端 DSN 仍放在 `ui/.env.production`，因为 DSN 会被打包到浏览器端；API Token 不能放进 `ui/.env*`。

配置完成后，进入 `ui` 目录即可完成构建、debug ID 注入和 legacy sourcemap 上传：

```bash
cd ui
npm run build:glitchtip
```

也可在执行 `npm run build` 后分步运行。页面初始化 Sentry 和上传 sourcemap 都统一使用 `ui/package.json` 的 `version` 作为 `release`：

```bash
npm run sourcemaps:upload
```

上传请求默认按每 4 个文件分批，以避免 GlitchTip/Nginx 的请求体大小限制；可通过 `SOURCEMAP_BATCH_FILE_COUNT` 调整批大小。上传完成后由 GlitchTip 异步处理，不在部署脚本中等待处理轮询。

CI/CD 中不要提交认证信息，应通过 Secret 变量提供：

```bash
SENTRY_URL=https://monitor.huzhibin.top \
SENTRY_ORG=swaggerhuzhibintop \
SENTRY_PROJECT=swagger \
SOURCEMAP_URL_PREFIX=https://swagger.huzhibin.top/assets/ \
SENTRY_AUTH_TOKEN=your-new-api-token \
npm run build:glitchtip
```

上传脚本从 `.env.glitchtip.local` 或 CI 环境变量读取 GlitchTip 地址、组织、项目和静态资源前缀；静态资源 artifact 前缀需要与事件 frame 的 `abs_path` 保持一致。

部署到生产服务器时，sourcemap 会先上传到 GlitchTip，随后只同步 JS/CSS 等运行文件，`.map` 文件不会部署到服务器，以避免暴露源代码。

## 10. UI 一键部署

`deploy:ui` 会依次执行 UI 依赖安装、类型检查、生产构建、legacy sourcemap 上传和远程发布。它会自动读取根目录的 `.env.glitchtip.local`：

```bash
DEPLOY_HOST=your-server-host \
DEPLOY_USER=root \
npm run deploy:ui
```

也可以先导出 `DEPLOY_HOST` 和 `DEPLOY_USER`，之后直接运行 `npm run deploy:ui`。脚本默认将 UI 发布到服务器的 `/srv/projects/ts-swagger`，可通过 `DEPLOY_ROOT` 覆盖。
