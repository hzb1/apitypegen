# MCP 接入指南

APITypeGen MCP 让 Codex、Claude Code 根据用户提供的接口文档地址搜索 API，
并生成 TypeScript 类型。

[返回文档中心](README.md) · [CLI](../cli/README.md) · [常见问题](troubleshooting.md)

## 使用要求

- Node.js 20 或更高版本；
- 已安装 Codex CLI 或 Claude Code；
- 只有读取 Swagger UI / Knife4j 页面时才需要系统 Chrome。

检查 Node.js：

```bash
node --version
npx --version
```

不需要全局安装 APITypeGen，下面的命令会通过 `npx` 自动下载和启动。

## 在 Codex 中安装

在终端执行：

```bash
codex mcp add apitypegen -- npx -y @hzb1/apitypegen mcp
```

检查是否安装成功：

```bash
codex mcp get apitypegen
codex mcp list
```

然后重启 Codex。在对话中输入 `/mcp`，应当能够看到 `apitypegen`。

Codex 会自动把配置保存到 `~/.codex/config.toml`，不需要手工编辑。
Codex CLI、桌面端和 IDE 扩展共享这份配置。详情见
[OpenAI 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。

## 在 Claude Code 中安装

### 推荐：所有项目都能使用

APITypeGen 是通用的接口类型工具，推荐安装到 Claude Code 的用户作用域：

```bash
claude mcp add --scope user --transport stdio apitypegen -- npx -y @hzb1/apitypegen mcp
```

只需配置一次，以后在本机任意项目中打开 Claude Code 都可以使用。

检查是否安装成功：

```bash
claude mcp get apitypegen
claude mcp list
```

然后重启 Claude Code。在对话中输入 `/mcp`，应当能够看到 `apitypegen`。

### 可选：只给当前项目使用

在项目目录中执行：

```bash
claude mcp add --scope local --transport stdio apitypegen -- npx -y @hzb1/apitypegen mcp
```

### 可选：让团队共享

在项目根目录执行：

```bash
claude mcp add --scope project --transport stdio apitypegen -- npx -y @hzb1/apitypegen mcp
```

Claude Code 会在项目根目录创建或更新 `.mcp.json`。这个文件可以提交到 Git，
团队成员首次使用时需要确认信任。

详情见 [Claude Code 官方 MCP 文档](https://code.claude.com/docs/en/mcp)。

## JSON 配置应该写在哪里

下面这种配置只适用于 Claude Code 的项目级 `.mcp.json`：

```json
{
  "mcpServers": {
    "apitypegen": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@hzb1/apitypegen", "mcp"]
    }
  }
}
```

一般不需要手写它，执行前面的 `claude mcp add --scope project ...` 即可自动生成。
Codex 使用 TOML 配置，不能把这段 JSON 写入 Codex。

## 如何使用

安装后直接向 AI 描述文档地址和目标接口，例如：

```text
使用 apitypegen，根据下面的 OpenAPI 地址查找“用户详情”接口，
生成 TypeScript 类型并写入当前项目：
http://localhost:9999/job/v3/api-docs
```

如果提供的是 Swagger UI / Knife4j 页面，请明确说明来源类型：

```text
使用 apitypegen 读取下面的 Swagger UI 页面，搜索“订单查询”接口并生成类型。
来源类型是 page：
http://localhost:9999/doc.html#/home
```

支持三种来源：

| 类型 | 地址 |
|---|---|
| `openapi` | OpenAPI 或 Swagger JSON 地址 |
| `swagger-config` | 包含一个或多个 OpenAPI 地址的多服务文档配置 JSON |
| `page` | 接口文档页面（Swagger UI / Knife4j）地址 |

APITypeGen 不会猜测文档地址。

如果用户只提供了地址、不确定来源类型，不需要让用户先研究文档结构；MCP 会先用
`inspect_source` 读取这个准确地址并按响应内容识别类型。

## MCP 工具

- `inspect_source`：识别用户明确提供的 URL 属于 `page`、`openapi` 还是 `swagger-config`；
- `search_apis`：搜索接口并返回精确的接口选择器；
- `generate_typescript`：生成该接口的模型、查询参数、请求体和响应类型。

AI 的标准调用流程是：

```text
inspect_source（类型未知时）→ search_apis → generate_typescript → 写入当前项目
```

三个工具均为只读工具。所有 MCP 结果使用 `schemaVersion: 1`。失败结果中的
`error.recovery` 会返回可直接继续调用的 MCP 工具和参数，或明确要求询问用户、停止重试。
APITypeGen 只返回查询结果和代码，不会自行修改项目文件。

如果 MCP 无法连接，可先运行本地自检：

```bash
apitypegen doctor --mcp
# 检查具体接口文档地址
apitypegen doctor --url https://example.com/openapi.json
```

该命令会检查 Node.js、配置文件、缓存目录以及 MCP Server 是否能够创建；传入 `--url` 后会自动识别来源并验证文档加载链路。

`search_apis` 返回 `confirmationRequired: true`。AI 必须先向用户展示候选接口并取得明确确认，
然后在调用 `generate_typescript` 时传入 `confirmed: true`。未确认时生成工具会返回
`CONFIRMATION_REQUIRED`，不会读取文档或生成代码。

## 常见问题

### 找不到 npm 包

确认包已发布：

```bash
npm view @hzb1/apitypegen version
```

### MCP 连接失败

在终端测试能否启动：

```bash
npx -y @hzb1/apitypegen mcp
```

正常情况下命令会保持运行并等待 MCP 通信。按 `Ctrl+C` 退出。

### 无法访问 localhost

文档服务必须能被运行 Codex 或 Claude Code 的同一台电脑访问。先确认该地址可以在
本机浏览器中打开。云端 AI 无法直接访问你电脑的 `localhost`。

### UI 模式无法启动

确认本机已安装 Chrome。如果已经知道 OpenAPI JSON 地址，优先使用 `openapi`，
这样不需要启动 Chrome。
