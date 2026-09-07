import type { GeneratedTypes } from "@/utils/SwaggerParser.ts";

export type ScrollRequest = {
  key: string;
  id: number;
};

/** 接口详情工作台按代码区域展示的生成结果。 */
export type TsCodeParts = {
  /** 请求与全部响应依赖的模型全集。 */
  Models: string;
  /** 查询及路径参数代码。 */
  "Query Params": string;
  /** 请求体代码。 */
  "Request Body": string;
  /** 兼容旧数据的默认响应代码。 */
  "Response Data": string;
  /** 按状态拆分的响应及其依赖模型；旧记录可省略。 */
  Responses?: GeneratedTypes["responses"];
};

export type LoadingFeedback = {
  title: string;
  button: string;
  text: string;
};
