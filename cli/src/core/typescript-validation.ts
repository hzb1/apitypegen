import ts from "typescript";

/**
 * TypeScript 生成代码的使用来源。
 *
 * - `web`：PC 端网页应用。
 * - `cli`：命令行工具。
 * - `mcp`：MCP 服务。
 */
export type TypeScriptValidationSource = "web" | "cli" | "mcp";

/**
 * TypeScript 生成代码所属的展示或输出区域。
 *
 * - `output`：CLI 或 MCP 返回的完整输出。
 * - `query`：查询参数类型。
 * - `requestBody`：请求体类型。
 * - `response`：指定状态码的响应类型。
 * - `models`：模型类型声明。
 */
export type TypeScriptCodeArea = "output" | "query" | "requestBody" | "response" | "models";

/** 单条 TypeScript 语法诊断。 */
export type TypeScriptSyntaxDiagnostic = {
  /** TypeScript 提供的稳定数字诊断码。 */
  code: number;

  /** 产生错误的代码区域。 */
  area: TypeScriptCodeArea;

  /** 响应代码区域对应的 HTTP 状态码。 */
  responseStatus?: string;

  /** 从一开始计算的错误行号。 */
  line: number;

  /** 从一开始计算的错误列号。 */
  column: number;
};

/** TypeScript 生成代码的语法校验输入。 */
export type TypeScriptValidationInput = {
  /** 需要校验的完整 TypeScript 代码。 */
  code: string;

  /** 代码所属的输出区域。 */
  area: TypeScriptCodeArea;

  /** 代码的使用来源。 */
  source: TypeScriptValidationSource;

  /** 响应代码区域对应的 HTTP 状态码。 */
  responseStatus?: string;
};

/** TypeScript 生成代码的语法校验结果。 */
export type TypeScriptValidationResult = {
  /** 代码是否没有语法错误。 */
  valid: boolean;

  /** 可安全展示和上报的语法诊断。 */
  diagnostics: TypeScriptSyntaxDiagnostic[];

  /** 用于客户端去重的稳定错误指纹。 */
  fingerprint: string;

  /** 本次校验的使用来源。 */
  source: TypeScriptValidationSource;
};

/** 根据诊断的稳定字段创建不包含生成代码的去重指纹。 */
function createDiagnosticFingerprint(
  source: TypeScriptValidationSource,
  diagnostics: TypeScriptSyntaxDiagnostic[],
): string {
  const signature = diagnostics
    .map((item) => `${item.area}:${item.responseStatus ?? "none"}:${item.code}:${item.line}:${item.column}`)
    .join("|");
  return `${source}:${signature || "valid"}`;
}

/** 使用 TypeScript 自身的解析器校验生成代码，不执行代码也不读取外部文件。 */
export function validateTypeScriptSyntax(
  input: TypeScriptValidationInput,
): TypeScriptValidationResult {
  const result = ts.transpileModule(input.code, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "generated.ts",
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic): TypeScriptSyntaxDiagnostic => {
      const position = diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : { line: 0, character: 0 };
      return {
        code: diagnostic.code,
        area: input.area,
        ...(input.responseStatus ? { responseStatus: input.responseStatus } : {}),
        line: position.line + 1,
        column: position.character + 1,
      };
    });

  return {
    valid: diagnostics.length === 0,
    diagnostics,
    fingerprint: createDiagnosticFingerprint(input.source, diagnostics),
    source: input.source,
  };
}
