# 开发指南

[返回文档中心](README.md)

## 环境

```bash
nvm use
npm install
```

项目使用 npm workspaces：

- `ui/`：React Web UI。
- `cli/`：CLI、生成器和 MCP Server。
- `extension/`：Chrome 扩展。

## 命令

```bash
npm run dev              # 启动 Web UI
npm run build            # 构建全部产品
npm run typecheck        # CLI + UI 类型检查
npm run lint             # UI lint
npm test                 # CLI 测试
npm run test:browser     # 需要系统 Chrome
```

也可单独执行 `build:ui`、`build:cli`、`build:extension`。

## 修改后验证

- CLI / 生成器：`npm run typecheck && npm test && npm run build:cli`
- Web UI：`npm run typecheck --workspace=@apitypegen/ui && npm run lint && npm run build:ui`
- 扩展：`npm run verify:version --workspace=@apitypegen/extension && npm run build:extension`

Web UI Demo 位于 `ui/public/demo/`。扩展构建后需在 `chrome://extensions` 重新加载 `extension/dist`。

各产品版本独立维护；扩展版本必须在 `package.json`、`src/manifest.json` 和 `src/config.ts` 中一致。
