# MCP 接入指南

APITypeGen MCP Server 随 CLI 发布，通过 stdio 为 AI 客户端提供接口搜索和 TypeScript 生成工具。

[返回文档中心](README.md) · [CLI](../cli/README.md) · [常见问题](troubleshooting.md)

## 配置

```bash
npm install -g apitypegen
```

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

客户端找不到命令时，把 `command` 改为可执行文件的绝对路径。

## 工具

### `search_apis`

必填：

- `source`: `{ "type": "ui|openapi|config", "url": "https://..." }`
- `keyword`: 搜索关键词

可选：`service`、`limit`（1–100）、`refresh`、`timeoutMs`、`chromePath`。

### `generate_typescript`

必填：`source`、`method`、`path`；多服务有歧义时还需 `service`。工具只返回代码，不写文件或剪贴板。

## 推荐流程

1. 用户明确提供文档地址。
2. 调用 `search_apis`。
3. 原样使用结果中的 `selector` 调用 `generate_typescript`。

不要从展示文本重新解析 selector，也不要猜测文档地址。

常见错误：

- `AMBIGUOUS_API`：补充 `service`。
- `API_NOT_FOUND`：重新搜索 selector。
- `INCOMPLETE_SERVICE_LOAD`：指定服务后重试。
- `SERVICE_LOAD_FAILED`：检查 URL、网络和超时。

两个工具均为只读、幂等操作，只访问用户明确提供的 `http` / `https` 地址。
