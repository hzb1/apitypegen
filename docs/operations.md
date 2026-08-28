# 部署与监控

仅面向项目维护者。[返回文档中心](README.md)

## UI

`main` 分支由 `.github/workflows/static.yml` 部署到 GitHub Pages。

自有服务器部署：

```bash
DEPLOY_HOST=your-host DEPLOY_USER=root npm run deploy:ui
```

可覆盖 `DEPLOY_PORT`、`DEPLOY_ROOT`、`RELEASE_KEEP` 和 `VITE_PROXY_EXTENSION_URL`。

## 扩展

`v*` tag 会触发 `.github/workflows/extension-release.yml`，构建并发布 zip。

```bash
npm run verify:version --workspace=@apitypegen/extension
DEPLOY_HOST=your-host DEPLOY_USER=root npm run deploy:extension
```

## GlitchTip 与 sourcemap

```bash
cp .env.glitchtip.example .env.glitchtip.local
```

配置 `SENTRY_URL` 和 `SENTRY_AUTH_TOKEN`，Token 只能放在本地文件或 CI Secret 中。

```bash
npm run build:glitchtip --workspace=@apitypegen/ui
npm run build:glitchtip:cli
```

常用覆盖项：

- UI：`UI_SENTRY_ORG`、`UI_SENTRY_PROJECT`、`UI_SOURCEMAP_URL_PREFIX`。
- CLI：`CLI_SENTRY_ORG`、`CLI_SENTRY_PROJECT`、`CLI_SOURCEMAP_URL_PREFIX`。

CLI 匿名错误上报默认关闭，`APITYPEGEN_TELEMETRY=1` 开启，`DO_NOT_TRACK=1` 强制关闭。

## 发布前检查

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run verify:version --workspace=@apitypegen/extension
```
