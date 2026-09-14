import { createHighlighterCore } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import typescript from "@shikijs/langs/typescript";
import githubDark from "@shikijs/themes/github-dark";

import type {
  CodeHighlighter,
  CodeHighlightTheme,
  HighlightedTokenStyle,
} from "./codeHighlighter.types.ts";

const SHIKI_THEME_BY_MODE = {
  dark: "github-dark",
} as const satisfies Record<CodeHighlightTheme, string>;

const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;
const FONT_STYLE_STRIKETHROUGH = 8;

/*
 * 高亮器初始化成本高于单次代码转换，因此在模块范围内只创建一次。
 * 这里仅注册 TypeScript 和一个主题，避免完整 Shiki bundle 生成无关语言分块。
 */
const highlighterPromise = createHighlighterCore({
  langs: [typescript],
  themes: [githubDark],
  engine: createJavaScriptRegexEngine(),
});

const mapFontStyle = (fontStyle: number | undefined): HighlightedTokenStyle | undefined => {
  if (fontStyle === undefined || fontStyle <= 0) return undefined;

  return {
    italic: (fontStyle & FONT_STYLE_ITALIC) !== 0,
    bold: (fontStyle & FONT_STYLE_BOLD) !== 0,
    underline: (fontStyle & FONT_STYLE_UNDERLINE) !== 0,
    strikethrough: (fontStyle & FONT_STYLE_STRIKETHROUGH) !== 0,
  };
};

/** 使用精细化 Shiki 依赖实现的代码高亮器。 */
export const shikiCodeHighlighter: CodeHighlighter = {
  highlight: async ({ code, language, theme }) => {
    const highlighter = await highlighterPromise;
    const result = highlighter.codeToTokens(code, {
      lang: language,
      theme: SHIKI_THEME_BY_MODE[theme],
    });

    return {
      foregroundColor: result.fg,
      lines: result.tokens.map((line) => line.map((token) => {
        const fontStyle = mapFontStyle(token.fontStyle);
        const style = token.color || fontStyle
          ? {
              ...fontStyle,
              color: token.color,
            }
          : undefined;

        return {
          content: token.content,
          style,
        };
      })),
    };
  },
};
