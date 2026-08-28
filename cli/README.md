# APITypeGen CLI

从 Swagger UI、OpenAPI JSON 或 `swagger-config` 中检索接口，并生成 TypeScript 类型。

## 安装

```bash
npm install -g apitypegen
```

## 使用

```bash
apitypegen --help
apitypegen search --type openapi --url <OpenAPI-URL> --keyword order
apitypegen gen --type openapi --url <OpenAPI-URL> --method post --path /api/order/create
```

CLI 支持交互模式，也可以通过 `--no-interactive` 和 `--format json` 在 AI、CI 或其他脚本中调用。完整说明参见[项目 README](https://github.com/hzb1/ts-swagger#8-cli给-ai脚本调用)。

## MCP

通过 stdio 启动本地 MCP Server：

```bash
apitypegen mcp
```

通用 MCP Client 配置示例：

```json
{
  "mcpServers": {
    "apitypegen": {
      "command": "apitypegen",
      "args": ["mcp"]
    }
  }
}
```

Server 提供两个只读工具：

- `search_apis`：根据明确的 `ui`、`openapi` 或 `config` 来源搜索接口，并返回可复用的精确 selector。
- `generate_typescript`：根据服务名、HTTP 方法和 OpenAPI 路径生成 TypeScript，只返回代码，不写文件或剪贴板。

推荐让 AI 先调用 `search_apis`，再把返回的 selector 传给 `generate_typescript`。MCP 与 CLI 共用同一应用层，不会启动 CLI 子进程，也不会解析终端输出。
