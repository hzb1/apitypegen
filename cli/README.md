# APITypeGen CLI

APITypeGen — 从 API 文档生成可靠的 TypeScript 类型。

CLI 支持从 Swagger UI、OpenAPI JSON 或 `swagger-config` 中搜索接口并生成类型，适合终端、脚本、CI 和 AI 调用。

[返回首页](../README.md) · [MCP 指南](../docs/mcp.md) · [常见问题](../docs/troubleshooting.md)

## 安装

```bash
npm install -g @hzb1/apitypegen
apitypegen --help
```

仓库内开发：

```bash
npm install
npm run build:cli
npm run apitypegen -- --help
```

## 来源

| `--type` | URL 内容 | 说明 |
| --- | --- | --- |
| `openapi` | OpenAPI / Swagger JSON | 推荐 |
| `config` | 多服务配置 JSON（`swagger-config`） | 支持多服务 |
| `page` | 接口文档页面（Swagger UI / Knife4j） | 需要本机 Chrome |

CLI 不会猜测文档地址。`page` 模式可用 `--chrome-path` 或 `APITYPEGEN_CHROME_PATH` 指定 Chrome。

## 常用命令

不带参数时进入交互式生成：

```bash
apitypegen
```

搜索接口：

```bash
apitypegen search \
  --type config \
  --url http://localhost:9999/v3/api-docs/swagger-config \
  --keyword order
```

生成类型：

```bash
apitypegen gen \
  --type openapi \
  --url http://localhost:9999/v3/api-docs \
  --method post \
  --path /api/order/create \
  --copy
```

AI / CI 调用：

```bash
apitypegen search \
  --no-interactive \
  --type openapi \
  --url http://localhost:9999/v3/api-docs \
  --keyword order \
  --format json
```

`--format json` 使用 `schemaVersion: 1` 的稳定协议：结果写入 `stdout`，日志写入 `stderr`，失败退出码为 `1`。

## 关键参数

- `--service <name>`：只加载指定服务，或消除同路径接口歧义。
- `--limit <1-100>`：搜索结果数，默认 20。
- `--refresh`：立即重新校验 5 分钟文档缓存。
- `--timeout <ms>`：请求超时，默认 15000ms。
- `--no-interactive`：缺少参数时直接失败。

完整参数以 `apitypegen --help` 为准。

## 配置

可复制 `cli/apitypegen.config.example.json` 为项目根目录的 `apitypegen.config.json`。来源优先级：

1. `--type` / `--url`
2. `APITYPEGEN_TYPE` / `APITYPEGEN_URL`
3. `apitypegen.config.json`

旧 `TS_SWAGGER_*` 环境变量和 `ts-swagger.config.json` 仍兼容读取。

## 多服务

- `search` 默认搜索全部服务，部分服务失败时仍返回成功结果和警告。
- `gen --service <name>` 只加载目标服务。
- 多个服务存在相同 `method + path` 时，非交互调用必须传 `--service`。

## MCP

CLI 包内置 stdio MCP Server：

```bash
apitypegen mcp
```

接入 Claude Code：

```bash
claude mcp add --transport stdio apitypegen -- apitypegen mcp
claude mcp get apitypegen
```

接入 Codex：

```bash
codex mcp add apitypegen -- apitypegen mcp
codex mcp get apitypegen
```

接入后可以直接对 AI 说：

```text
使用 apitypegen，从这个 OpenAPI 地址搜索“订单详情”接口，
生成 TypeScript 类型并写入 src/api/order.types.ts：
https://example.com/openapi.json
```

MCP 提供只读的 `search_apis` 和 `generate_typescript` 工具。完整说明见
[MCP 指南](../docs/mcp.md)。匿名错误上报默认关闭；`APITYPEGEN_TELEMETRY=1`
开启，`DO_NOT_TRACK=1` 强制关闭。
