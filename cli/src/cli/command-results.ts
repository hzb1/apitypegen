import type { ApiItem } from "../core/api-index.js";
import type { SwaggerSourceInspection } from "../core/source-inspector.js";
import type { SwaggerServiceConfig } from "../core/swagger-loader.js";
import type { GeneratedTypes } from "../core/swagger-to-ts.js";
import type { ApiSelector, CliProtocolWarning } from "./protocol.js";

/**
 * inspect 命令支持的输出格式。
 *
 * - `text`：输出便于人工阅读的来源识别结果。
 * - `json`：输出版本化的 JSON 协议对象。
 */
export type InspectOutputFormat = "text" | "json";

/** inspect 命令执行完成后交给展示层的统一结果。 */
export type InspectCommandResult = {
  /** 用户请求的展示格式。 */
  outputFormat: InspectOutputFormat;

  /** 根据响应内容识别出的来源信息。 */
  data: SwaggerSourceInspection;
};

/**
 * search 命令支持的输出格式。
 *
 * - `text`：输出便于人工阅读的文本。
 * - `json`：输出版本化的 JSON 协议对象。
 */
export type SearchOutputFormat = "text" | "json";

/**
 * gen 命令支持的输出格式。
 *
 * - `ts`：直接输出生成的 TypeScript 代码。
 * - `json`：输出包含代码与结构化分段的 JSON 协议对象。
 */
export type GenOutputFormat = "ts" | "json";

/** 单个服务文档加载失败后的结构化信息。 */
export type ServiceLoadFailure = {
  /** 加载失败的服务名称。 */
  service: string;

  /** OpenAPI 文档地址。 */
  documentUrl: string;

  /** 服务加载失败的具体原因。 */
  message: string;
};

/** search 命令返回的单个 API 结果。 */
export type SearchResultItem = ApiItem & {
  /** API 所属服务的名称。 */
  service: string;

  /** API 所属 OpenAPI 文档的地址。 */
  documentUrl: string;

  /** 可直接传递给 gen 命令的 API 选择器。 */
  selector: ApiSelector;
};

/** search 命令写入稳定 JSON 协议的数据。 */
export type SearchCommandData = {
  /** 来源地址的协议与主机部分。 */
  host: string;

  /** 用户指定的服务过滤条件。 */
  service: string | null;

  /** 来源中声明的完整服务列表。 */
  services: SwaggerServiceConfig[];

  /** 成功加载的服务或文档数量。 */
  loadedServices: number;

  /** 加载失败的服务列表。 */
  failedServices: ServiceLoadFailure[];

  /** 本次搜索使用的关键词。 */
  keyword: string;

  /** 未应用数量限制前的匹配总数。 */
  total: number;

  /** 本次实际返回的结果数量。 */
  returned: number;

  /** 本次搜索使用的最大结果数。 */
  limit: number;

  /** 按稳定顺序返回的 API 列表。 */
  items: SearchResultItem[];
};

/** search 命令执行完成后交给展示层的统一结果。 */
export type SearchCommandResult = {
  /** 用户请求的展示格式。 */
  outputFormat: SearchOutputFormat;

  /** search 命令的结构化数据。 */
  data: SearchCommandData;

  /** 不阻止搜索成功的警告列表。 */
  warnings: CliProtocolWarning[];
};

/** gen 命令写入稳定 JSON 协议的数据。 */
export type GenCommandData = {
  /** 来源地址的协议与主机部分。 */
  host: string;

  /** 目标 API 所属服务；单文档来源时为 null。 */
  service: string | null;

  /** 目标 API 所属 OpenAPI 文档的地址。 */
  documentUrl: string;

  /** 本次生成使用的精确 API 选择器。 */
  selector: ApiSelector;

  /** OpenAPI 文档中的目标接口信息。 */
  matchedApi: ApiItem;

  /** 可以直接使用的完整 TypeScript 输出。 */
  code: string;

  /** 按模型、查询参数、请求体和响应拆分的生成结果。 */
  parts: GeneratedTypes;
};

/** gen 命令执行完成后交给展示层的统一结果。 */
export type GenCommandResult = {
  /** 用户请求的展示格式。 */
  outputFormat: GenOutputFormat;

  /** gen 命令的结构化数据。 */
  data: GenCommandData;

  /** 是否已成功复制 TypeScript 到剪贴板。 */
  copied: boolean;
};
