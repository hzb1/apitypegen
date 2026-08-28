# 常见问题

[返回文档中心](README.md)

## Web UI 加载失败

1. 确认 URL 是 JSON 文档，而不是 Swagger UI 页面。
2. 确认浏览器能访问目标地址。
3. 跨域、内网或证书异常时安装[浏览器扩展](../extension/README.md)。
4. 在 `/proxy-fetch` 对比原生 `fetch` 与 `proxyFetch`。

只使用 Demo、同源文档或本地接口库时，可以忽略扩展未启用提示。

## CLI / MCP 来源怎么选

- 直接返回 OpenAPI JSON：`openapi`。
- 返回多服务文档配置 JSON：`swagger-config`。
- 接口文档页面（Swagger UI / Knife4j）：`page`，需要 Chrome。

Chrome 不在标准路径时使用 `--chrome-path` 或 `APITYPEGEN_CHROME_PATH`。

## 接口不唯一

多个服务可能存在相同 `method + path`。CLI 传 `--service`；MCP 原样使用 `search_apis` 返回的 selector。

## 部分服务不可用

`search` 会返回成功结果和失败警告。`gen` 应指定 `--service`，避免因无法确认接口唯一而失败。

## 类型为空或出现 `any`

确认文档为该接口定义了 parameters、request body、response、schema 和可解析的 `$ref`。缺少结构定义时类型会退化。

## JSON 无法解析

CLI 的 JSON 结果写入 `stdout`，日志写入 `stderr`。不要使用 `2>&1` 合并后再解析。

## 缓存未更新

CLI 和 MCP 默认缓存 5 分钟。使用 `--refresh` 或 `refresh: true` 立即重新校验。

## 本地接口库丢失

本地库按浏览器 origin 隔离；切换协议、域名或端口会看到不同数据。清理站点数据会删除记录。
