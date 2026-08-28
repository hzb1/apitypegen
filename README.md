# APITypeGen

从 OpenAPI / Swagger 文档生成 TypeScript 类型。项目提供四个产品入口：

| 场景 | 使用产品 | 文档 |
| --- | --- | --- |
| 浏览、搜索接口并复制类型 | Web UI | [使用指南](ui/README.md) |
| 在终端、脚本或 CI 中生成类型 | CLI | [使用指南](cli/README.md) |
| 让 AI 客户端调用接口搜索与生成工具 | MCP Server | [接入指南](docs/mcp.md) |
| Web UI 访问内网或跨域接口 | 浏览器扩展 | [安装指南](extension/README.md) |

Web UI、CLI 和 MCP Server 可以独立使用；浏览器扩展只增强 Web UI 的网络访问能力。

## 快速开始

### Web UI

```bash
npm install
npm run dev
```

打开页面后点击“试用示例项目”，无需后端和浏览器扩展。

### CLI

```bash
npm install -g apitypegen
apitypegen gen \
  --type openapi \
  --url https://example.com/openapi.json \
  --method post \
  --path /api/order/create
```

### MCP Server

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

## 来源类型

CLI 和 MCP 使用相同的来源：

- `openapi`：直接返回 OpenAPI / Swagger JSON 的 URL。
- `config`：直接返回 `swagger-config` JSON 的 URL。
- `ui`：Swagger UI / Knife4j 页面 URL，需要本机 Chrome。

工具不会猜测或探测文档地址。Web UI 加载跨域或内网文档时通常需要浏览器扩展。

## 文档

- [文档中心](docs/README.md)
- [开发指南](docs/development.md)
- [常见问题](docs/troubleshooting.md)
- [部署与监控](docs/operations.md)
- [URL 状态流转](URL-FLOW.md)
- [版本路线图](ROADMAP.md)

项目使用 npm workspaces，要求 Node.js `^20.19.0 || >=22.12.0`，推荐使用 `.nvmrc` 中的版本。
