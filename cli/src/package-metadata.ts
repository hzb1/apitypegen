import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** APITypeGen npm 包中供运行时读取的元数据。 */
type ApiTypeGenPackageMetadata = {
  /** 当前发布的 npm 包版本。 */
  version?: unknown;
};

/**
 * 读取当前安装的 APITypeGen npm 包版本。
 *
 * package.json 是 npm 包的一部分，因此 CLI、MCP 和遥测可以共享同一个版本来源。
 */
export function readPackageVersion(): string {
  const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
  const metadata = JSON.parse(
    readFileSync(packagePath, "utf8"),
  ) as ApiTypeGenPackageMetadata;

  if (typeof metadata.version !== "string" || !metadata.version.trim()) {
    throw new Error("apitypegen package.json 缺少有效的 version");
  }

  return metadata.version.trim();
}
