import type { CodeHighlighter } from "./codeHighlighter.types.ts";
import { shikiCodeHighlighter } from "./shikiCodeHighlighter.ts";

/*
 * 组件只依赖该通用出口。后续替换高亮引擎时，仅需更换这里的实现，
 * 无需修改代码卡片、业务页面或高亮结果的渲染结构。
 */
export const codeHighlighter: CodeHighlighter = shikiCodeHighlighter;
