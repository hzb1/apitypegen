import process from "node:process";
import type { GenCommandResult, SearchCommandResult, SearchResultItem } from "./command-results.js";
import {
  createProtocolFailure,
  createProtocolSuccess,
  normalizeProtocolError,
  type CliProtocolError,
} from "./protocol.js";

/** CLI 展示层使用的标准输出与错误输出写入器。 */
export type CliOutputWriter = {
  /** 向 stdout 写入最终命令结果。 */
  writeStdout: (content: string) => void;

  /** 向 stderr 写入进度、警告或人类错误提示。 */
  writeStderr: (content: string) => void;
};

/** CLI 加载过程使用的进度报告器。 */
export type CliProgressReporter = {
  /** 输出一条不属于最终命令结果的进度信息。 */
  report: (message: string) => void;
};

/** 将内容写入当前 Node.js 进程标准流的默认写入器。 */
export const processOutputWriter: CliOutputWriter = {
  writeStdout: (content) => process.stdout.write(content),
  writeStderr: (content) => process.stderr.write(content),
};

/** 创建只向 stderr 输出的 CLI 进度报告器。 */
export function createProgressReporter(
  output: CliOutputWriter = processOutputWriter,
): CliProgressReporter {
  return {
    report: (message) => output.writeStderr(`${message}\n`),
  };
}

function formatSearchResultItem(item: SearchResultItem): string {
  const summary = item.summary || item.description || "";
  return `[${item.service}] ${item.method.toUpperCase()} ${item.path}${summary ? `  // ${summary}` : ""}`;
}

/** 根据用户选择的格式展示 search 命令结果。 */
export function presentSearchResult(
  result: SearchCommandResult,
  output: CliOutputWriter = processOutputWriter,
): void {
  result.warnings.forEach((warning) =>
    output.writeStderr(`[ts-swagger] 警告: ${warning.message}\n`),
  );

  if (result.outputFormat === "json") {
    output.writeStdout(
      `${JSON.stringify(createProtocolSuccess("search", result.data, result.warnings), null, 2)}\n`,
    );
    return;
  }

  output.writeStdout(`关键词: ${result.data.keyword}\n`);
  output.writeStdout(`已加载服务/文档: ${result.data.loadedServices}\n`);
  if (result.data.failedServices.length > 0) {
    output.writeStdout(`加载失败服务: ${result.data.failedServices.length}\n`);
  }
  output.writeStdout(`匹配结果: ${result.data.total}，显示: ${result.data.returned}\n`);
  if (result.data.total === 0) {
    output.writeStdout("未匹配到 API。\n");
    return;
  }
  result.data.items.forEach((item) => {
    output.writeStdout(`${formatSearchResultItem(item)}\n`);
  });
}

/** 根据用户选择的格式展示 gen 命令结果。 */
export function presentGenResult(
  result: GenCommandResult,
  output: CliOutputWriter = processOutputWriter,
): void {
  if (result.outputFormat === "json") {
    output.writeStdout(
      `${JSON.stringify(createProtocolSuccess("gen", result.data), null, 2)}\n`,
    );
  } else {
    output.writeStdout(`${result.data.code}\n`);
  }

  if (result.copied) {
    output.writeStderr("已复制生成的 TypeScript 到剪贴板。\n");
  }
}

function formatRecoveryArgument(argument: string): string {
  return /^[a-zA-Z0-9_./:@=-]+$/.test(argument) ? argument : JSON.stringify(argument);
}

/** 以便于用户阅读和复制的方式展示 CLI 失败。 */
export function presentTextFailure(
  error: CliProtocolError,
  output: CliOutputWriter = processOutputWriter,
): void {
  output.writeStderr(`[ts-swagger] ${error.message}\n`);
  if (!error.recovery) return;

  output.writeStderr(`[ts-swagger] 修复建议: ${error.recovery.message}\n`);
  error.recovery.commands?.forEach((command) => {
    const commandText = ["ts-swagger", command.command, ...command.args]
      .map(formatRecoveryArgument)
      .join(" ");
    output.writeStderr(`  ${commandText}\n`);
  });
}

/** 以稳定 JSON 协议展示 CLI 失败。 */
export function presentJsonFailure(
  command: string,
  error: unknown,
  output: CliOutputWriter = processOutputWriter,
): void {
  output.writeStdout(`${JSON.stringify(createProtocolFailure(command, error), null, 2)}\n`);
}

/** 根据输出模式选择人类错误或稳定 JSON 错误展示。 */
export function presentFailure(
  command: string,
  jsonOutput: boolean,
  error: unknown,
  output: CliOutputWriter = processOutputWriter,
): CliProtocolError {
  const normalizedError = normalizeProtocolError(error);
  if (jsonOutput) {
    presentJsonFailure(command, normalizedError, output);
  } else {
    presentTextFailure(normalizedError, output);
  }
  return normalizedError;
}
