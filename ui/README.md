# APITypeGen Web UI

APITypeGen — 从 API 文档生成可靠的 TypeScript 类型。

Web UI 用于在浏览器中加载 OpenAPI / Swagger 文档、搜索接口并复制生成结果。

[返回首页](../README.md) · [浏览器扩展](../extension/README.md) · [常见问题](../docs/troubleshooting.md)

## 启动

```bash
npm install
npm run dev
```

打开终端输出的地址：

- “试用示例项目”：加载 `/demo/openapi.json`。
- “多服务示例”：加载 `/demo/swagger-config.json`。

两种 Demo 都不依赖后端或浏览器扩展。

## 可用能力

- 浏览分组、搜索接口、查看并复制生成类型。
- 加载同源或允许 CORS 的远程文档。
- 保存到浏览器本地接口库，之后离线打开。
- 在 `/network` 调试请求。

本地库保存在 IndexedDB，按站点 origin 隔离；清理站点数据会删除记录。

## 浏览器扩展

以下场景需要扩展：

- 加载内网或受 CORS 限制的文档。
- 代理发送跨域请求。
- 使用 `proxyFetch` 调试模式。

安装方法见 [浏览器扩展指南](../extension/README.md)。

## 检查

```bash
npm run typecheck --workspace=@apitypegen/ui
npm run lint --workspace=@apitypegen/ui
npm run build:ui
```
