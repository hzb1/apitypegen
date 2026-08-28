# APITypeGen 浏览器扩展

为 Web UI 代理内网或受 CORS 限制的接口文档和调试请求。CLI 与 MCP 不依赖该扩展。

[返回首页](../README.md) · [Web UI](../ui/README.md) · [常见问题](../docs/troubleshooting.md)

## 安装

1. 从 [GitHub Releases](https://github.com/hzb1/apitypegen/releases/latest) 下载并解压扩展包。
2. 打开 `chrome://extensions`，启用“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择解压目录。
4. 刷新 Web UI，点击“重新检测”。

## 本地构建

```bash
npm install
npm run build:extension
```

然后在 Chrome 中加载 `extension/dist`。修改后需重新加载扩展并刷新 Web UI。

## 权限

扩展需要网络请求和站点访问权限，用于访问用户明确输入的目标地址并把响应返回 Web UI。请只从本项目发布页安装。

## 维护

发布前确保以下三处版本一致：

- `extension/package.json`
- `extension/src/manifest.json`
- `extension/src/config.ts`

```bash
npm run verify:version --workspace=@apitypegen/extension
```
