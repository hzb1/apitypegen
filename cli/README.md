# ts-swagger CLI

从 Swagger UI、OpenAPI JSON 或 `swagger-config` 中检索接口，并生成 TypeScript 类型。

## 安装

```bash
npm install -g ts-swagger
```

## 使用

```bash
ts-swagger --help
ts-swagger search --type openapi --url <OpenAPI-URL> --keyword order
ts-swagger gen --type openapi --url <OpenAPI-URL> --method post --path /api/order/create
```

CLI 支持交互模式，也可以通过 `--no-interactive` 和 `--format json` 在 AI、CI 或其他脚本中调用。完整说明参见[项目 README](https://github.com/hzb1/ts-swagger#8-cli给-ai脚本调用)。
