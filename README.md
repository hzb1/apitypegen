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

Web UI 是最适合首次体验的入口。在仓库根目录安装 workspace 依赖并启动开发服务：

```bash
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

`cli` workspace 是可独立发布的 `ts-swagger` npm 包，支持跨服务检索接口和按接口生成 TypeScript。

### 8.1 安装 / 使用

本项目内开发时可直接运行：

```bash
npm run ts-swagger -- --help
npm run ts-swagger
npm run ts-swagger -- search --type config --url http://localhost:9999/v3/api-docs/swagger-config --keyword order
npm run ts-swagger -- gen --type openapi --url http://localhost:9999/job/v3/api-docs --method post --path /api/order/create
```

本机日常使用可以通过 `npm link` 注册全局命令：

```bash
cd cli
npm link
ts-swagger --help
ts-swagger
```

发布到 npm 后，可通过全局安装使用：

```bash
npm install -g ts-swagger
ts-swagger gen --type ui --url http://localhost:9999/doc.html#/home
```

### 8.2 可选配置

`ts-swagger.config.json` 不是必需文件。它适合保存常用文档来源和生成偏好，已被 `.gitignore` 忽略。

可以参考 `cli/ts-swagger.config.example.json` 新建本地配置：

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
ts-swagger
```

### 8.3 常用命令

```bash
# 默认进入交互式生成（选择来源后，从全部服务中选择 API）
npm run ts-swagger

# 也可以显式使用 gen
npm run ts-swagger -- gen --type ui --url http://localhost:9999/doc.html#/home

# 从明确的 swagger-config 搜索全部服务
npm run ts-swagger -- search --type config --url http://localhost:9999/v3/api-docs/swagger-config --keyword order

# 仅搜索指定服务
npm run ts-swagger -- search --type config --url http://localhost:9999/v3/api-docs/swagger-config --keyword order --service 用户服务

# 从明确的 OpenAPI JSON 生成 TS
npm run ts-swagger -- gen --type openapi --url http://localhost:9999/job/v3/api-docs --method post --path /api/order/create

# 生成 TS 并复制到剪切板
npm run ts-swagger -- gen --type openapi --url http://localhost:9999/job/v3/api-docs --method post --path /api/order/create --copy

# 在 AI / CI 中禁用交互（缺参数直接报错）
npm run ts-swagger -- gen --no-interactive --type openapi --url http://localhost:9999/job/v3/api-docs --method post --path /api/order/create

# 忽略缓存有效期，立即向服务端重新校验文档
npm run ts-swagger -- search --type config --url http://localhost:9999/v3/api-docs/swagger-config --keyword order --refresh
```

CLI 只支持三种明确来源：

- `ui`：启动系统 Chrome，加载 Swagger UI / Knife4j 页面，只读取页面真实发出的 GET 响应。
- `openapi`：地址必须直接返回 OpenAPI / Swagger JSON。
- `config`：地址必须直接返回 swagger-config JSON。

CLI 不会枚举、探测或猜测 OpenAPI 地址。`ui` 模式需要系统 Chrome；非标准安装位置可使用 `--chrome-path` 或 `TS_SWAGGER_CHROME_PATH` 指定。

### 8.4 面向 AI 的 JSON 协议

`search` 和 `gen` 使用 `--format json` 时统一输出 `schemaVersion: 1` 的协议对象。成功和失败都写入 `stdout`，运行日志只写入 `stderr`；失败时进程退出码仍为 `1`。

```bash
ts-swagger search --type config --url <url> --keyword order --limit 20 --format json
```

成功响应：

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "search",
  "data": {
    "total": 1,
    "returned": 1,
    "limit": 20,
    "items": [
      {
        "service": "order-service",
        "method": "post",
        "path": "/order/create",
        "selector": {
          "service": "order-service",
          "method": "post",
          "path": "/order/create"
        }
      }
    ]
  },
  "warnings": []
}
```

失败响应：

```json
{
  "schemaVersion": 1,
  "ok": false,
  "command": "gen",
  "error": {
    "code": "AMBIGUOUS_API",
    "message": "多个服务中存在相同 API",
    "details": {
      "candidates": []
    },
    "recovery": {
      "action": "retry",
      "message": "请选择目标服务，并使用对应参数重新执行 gen。",
      "commands": [
        {
          "command": "gen",
          "args": [
            "--type",
            "config",
            "--url",
            "http://localhost:9999/v3/api-docs/swagger-config",
            "--service",
            "order-service",
            "--method",
            "get",
            "--path",
            "/health",
            "--no-interactive",
            "--format",
            "json"
          ]
        }
      ]
    }
  }
}
```

`AMBIGUOUS_API`、`API_NOT_FOUND` 和 `INCOMPLETE_SERVICE_LOAD` 会提供可选的 `error.recovery`。其中 `commands` 使用 `{ command, args[] }`，调用方应直接把参数数组交给进程执行器，不需要解析或执行 Shell 字符串；`API_NOT_FOUND` 还会返回最多 5 个相近 API 的 `selector`。包含凭据或 token 的来源 URL 会替换为 `<source-url>`，调用方重试前需要自行填回安全来源地址。

搜索默认返回前 20 条结果，`--limit` 支持 `1` 到 `100`。结果按照 path、operationId、summary、tag、description 的匹配优先级排序，同分结果使用服务名、path、method 和 operationId 保持稳定顺序。AI 应直接读取搜索项中的 `selector` 调用 `gen`，不要从展示文本中重新提取参数。

多服务搜索允许部分成功。无法加载的服务会同时出现在 `data.failedServices` 和顶层 `warnings` 中；只要至少一个服务成功，`ok` 仍为 `true`。全部服务均失败时返回 `SERVICE_LOAD_FAILED`。

### 8.5 服务参数行为

- `services` 命令已移除；服务列表仅作为内部加载信息，不再要求用户先查看或选择。
- `search` 和 `gen` 默认并发加载全部服务的 OpenAPI 文档，不再先让用户选择服务。
- `search` 会保留已成功加载服务的搜索结果，并报告失败服务，不会因为单个无关服务不可用而放弃全部结果。
- 未传 `--service` 的 `gen` 如果遇到服务加载失败，会返回 `INCOMPLETE_SERVICE_LOAD`，因为此时无法确认目标 API 在全部服务中是否唯一。
- `gen --service <name>` 只加载目标服务，不受其他服务故障影响；目标服务本身失败时返回 `SERVICE_LOAD_FAILED`。
- API 搜索结果和交互式 API 列表会以 `[服务名]` 标注所属服务。
- `--service <name>` 是可选过滤器；传入后只加载并处理指定服务，适合局部检索或明确存在同名接口时使用。
- 多个服务存在相同的 `method + path` 时，交互终端会让用户从带服务名的 API 项中选择；非交互模式需要通过 `--service` 消除歧义。
- 同时加载多个服务时最多并发请求 4 个 OpenAPI 文档。

### 8.6 性能与缓存

- OpenAPI 文档默认缓存 5 分钟；有效期内再次执行 `search` 或 `gen` 不会重复下载服务文档。
- 缓存过期后会优先使用 `ETag` 和 `Last-Modified` 发起条件请求；服务端返回 `304` 时继续使用本地文档。
- `--refresh` 会跳过 5 分钟有效期并立即向服务端重新校验，但服务端支持条件请求时不必重新传输完整文档。
- 多服务仍最多并发加载 4 个文档，加载进度和缓存状态只写入 `stderr`，`--format json` 的 `stdout` 保持为单一协议对象。
- 默认缓存目录为 `$XDG_CACHE_HOME/ts-swagger/openapi`；未配置 `XDG_CACHE_HOME` 时使用 `~/.cache/ts-swagger/openapi`。
- 缓存文件名只使用来源 URL 的 SHA-256 摘要，缓存元数据不保存原始来源 URL、请求头或鉴权信息；目录和文件权限分别限制为 `0700` 与 `0600`。
- 缓存目录不可读写或缓存内容损坏时会退回网络加载，不影响 CLI 的正常功能。

### 8.7 gen 交互行为

- 在交互终端中执行 `ts-swagger gen`，可不传 `--type` / `--url` / `--method` / `--path`，CLI 会逐步提问。
- 先选择 `Swagger UI / Knife4j 页面`、`OpenAPI JSON` 或 `swagger-config JSON`，再输入对应地址。
- UI 来源通过系统 Chrome 读取页面真实 GET 响应，不会检查页面源码或尝试候选路径。
- 若来源包含多个服务，CLI 会加载全部服务，然后通过关键词筛选并选择带服务名的接口。
- 最后可选择输出格式（TypeScript / JSON）及是否复制到剪贴板。

## 9. GlitchTip sourcemap

### 9.1 CLI 匿名错误上报

CLI 的匿名错误上报默认关闭，显式开启后会发送至 GlitchTip 的 `ts-swagger/cli` 项目：

```bash
TS_SWAGGER_TELEMETRY=1 ts-swagger gen \
  --type openapi \
  --url https://example.com/openapi.json
```

设置 `DO_NOT_TRACK=1` 会覆盖上述配置并禁止上报。私有部署或本地接收测试可以通过 `TS_SWAGGER_GLITCHTIP_DSN` 覆盖内置 DSN。CLI 只上报无法归类的 `UNKNOWN_ERROR`，不会上报参数错误、API 未找到、来源超时等预期失败；上报事件仅保留 CLI release、已知命令名、错误码、Node 主版本、操作系统、架构、脱敏堆栈、最多 3 层 cause，以及公开 `dist` 应用帧的前后源码行。Swagger URL、认证信息、OpenAPI 内容、生成结果、搜索关键词、用户目录、运行时变量、第三方源码上下文、请求、用户上下文、面包屑及额外数据不会发送。

GlitchTip SDK 仅在显式开启且发生未知异常时动态加载。事件发送失败或 750ms 内无法完成刷新时，不会改变 CLI 的 stdout、stderr 或退出码。DSN 只用于接收事件，不要把 `SENTRY_AUTH_TOKEN` 放入 CLI 环境或 npm 包；API Token 仍仅用于 CI/CD 上传 sourcemap。

CLI release 使用 `cli/package.json` 的版本并标记为 `ts-swagger@<version>`。CLI 与 UI 使用不同的 GlitchTip 项目和 sourcemap 发布任务，避免 `cli/package.json` 与 `ui/package.json` 的版本及事件类型互相混淆。

需要验证真实函数名、cause 和源码上下文时，可以显式发送一条诊断测试事件。该命令会向真实 `cli` 项目写入一个 Issue，不属于普通本地测试：

```bash
npm run glitchtip:test:cli
```

命令成功会输出明确提示；设置 `DO_NOT_TRACK=1` 时会拒绝发送并返回非零退出码。

### 9.2 CLI sourcemap

CLI 构建会为 `cli/dist/**/*.js` 生成带内嵌 TypeScript 源码的 `.js.map`，事件帧统一使用 `app:///dist/...`。在 `.env.glitchtip.local` 中准备 `SENTRY_URL` 和 `SENTRY_AUTH_TOKEN` 后，执行：

```bash
npm run build:glitchtip:cli
```

该命令会先构建 CLI，再把 JavaScript 和 sourcemap 上传到默认组织 `ts-swagger`、项目 `cli`，release 为 `ts-swagger@<version>`，artifact 前缀为 `app:///dist`。私有部署可以分别通过 `CLI_SENTRY_ORG`、`CLI_SENTRY_PROJECT` 和 `CLI_SOURCEMAP_URL_PREFIX` 覆盖。

### 9.3 UI sourcemap

UI 生产构建会在 `ui/dist` 中生成 sourcemap，并上传到 GlitchTip 的 `ts-swagger` 组织下“网页应用”项目（ID `3`）。使用项目 ID 可以避免项目 slug 改名影响上传。首次使用前需安装 `@sentry/cli`，并准备好 GlitchTip API token：

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
UI_SENTRY_ORG=ts-swagger \
UI_SENTRY_PROJECT=3 \
UI_SOURCEMAP_URL_PREFIX=https://swagger.huzhibin.top/assets/ \
SENTRY_AUTH_TOKEN=your-new-api-token \
npm run build:glitchtip
```

上传脚本从 `.env.glitchtip.local` 或 CI 环境变量读取 GlitchTip 地址、Token，以及 UI 专用的 `UI_SENTRY_ORG`、`UI_SENTRY_PROJECT`、`UI_SOURCEMAP_URL_PREFIX`。默认值分别为 `ts-swagger`、`3`、`https://swagger.huzhibin.top/assets/`；`UI_SENTRY_PROJECT` 可以填写项目 ID 或 slug，静态资源 artifact 前缀需要与事件 frame 的 `abs_path` 保持一致。

部署到生产服务器时，sourcemap 会先上传到 GlitchTip，随后只同步 JS/CSS 等运行文件，`.map` 文件不会部署到服务器，以避免暴露源代码。

## 10. UI 一键部署

`deploy:ui` 会依次执行 UI 依赖安装、类型检查、生产构建、legacy sourcemap 上传和远程发布。它会自动读取根目录的 `.env.glitchtip.local`：

```bash
DEPLOY_HOST=your-server-host \
DEPLOY_USER=root \
npm run deploy:ui
```

也可以先导出 `DEPLOY_HOST` 和 `DEPLOY_USER`，之后直接运行 `npm run deploy:ui`。脚本默认将 UI 发布到服务器的 `/srv/projects/ts-swagger`，可通过 `DEPLOY_ROOT` 覆盖。
