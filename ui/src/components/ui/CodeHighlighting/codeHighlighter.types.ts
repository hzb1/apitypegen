/**
 * 代码高亮器支持的语言。
 *
 * - `typescript`：APITypeGen 生成的 TypeScript 类型代码。
 */
export type CodeHighlightLanguage = "typescript";

/**
 * 代码高亮器支持的主题。
 *
 * - `dark`：代码卡片固定使用的深色阅读主题。
 */
export type CodeHighlightTheme = "dark";

/** 代码高亮请求。 */
export type CodeHighlightRequest = {
  /** 需要高亮的源代码。 */
  code: string;
  /** 源代码使用的编程语言。 */
  language: CodeHighlightLanguage;
  /** 代码区域使用的视觉主题。 */
  theme: CodeHighlightTheme;
};

/** 与具体高亮引擎无关的文本样式。 */
export type HighlightedTokenStyle = {
  /** 文本颜色。 */
  color?: string;
  /** 是否使用斜体。 */
  italic?: boolean;
  /** 是否使用粗体。 */
  bold?: boolean;
  /** 是否显示下划线。 */
  underline?: boolean;
  /** 是否显示删除线。 */
  strikethrough?: boolean;
};

/** 高亮后的最小文本单元。 */
export type HighlightedToken = {
  /** 原始文本内容。 */
  content: string;
  /** 文本的可选视觉样式。 */
  style?: HighlightedTokenStyle;
};

/** 与具体高亮引擎无关的代码高亮结果。 */
export type HighlightedCode = {
  /** 代码区域的默认前景色。 */
  foregroundColor?: string;
  /** 按源代码行组织的高亮文本。 */
  lines: HighlightedToken[][];
};

/** 可替换的代码高亮器能力边界。 */
export interface CodeHighlighter {
  /** 将源代码转换为可由界面直接渲染的通用 token。 */
  highlight: (request: CodeHighlightRequest) => Promise<HighlightedCode>;
}
