import { Fragment, useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { codeHighlighter } from "./codeHighlighter.ts";
import type { HighlightedCode, HighlightedToken } from "./codeHighlighter.types.ts";
import "./CodeHighlighting.css";

const EMPTY_CODE = "// 空的";

/** 代码展示组件的输入。 */
type CodeHighlightingProps = {
  /** 需要以 TypeScript 展示的源代码。 */
  code?: string;
};

/** 已完成的异步高亮结果及其对应源代码。 */
type HighlightedCodeState = {
  /** 生成当前高亮结果时使用的源代码。 */
  sourceCode: string;
  /** 高亮器返回的通用 token 结果。 */
  result: HighlightedCode;
};

const createPlainCode = (code: string): HighlightedCode => ({
  lines: code.split("\n").map((line) => [{ content: line }]),
});

const getTokenStyle = (token: HighlightedToken): CSSProperties | undefined => {
  if (!token.style) return undefined;

  return {
    color: token.style.color,
    fontStyle: token.style.italic ? "italic" : undefined,
    fontWeight: token.style.bold ? 700 : undefined,
    textDecoration: [
      token.style.underline ? "underline" : "",
      token.style.strikethrough ? "line-through" : "",
    ].filter(Boolean).join(" ") || undefined,
  };
};

/** 使用可替换高亮器展示只读 TypeScript 代码。 */
const CodeHighlighting = ({ code }: CodeHighlightingProps) => {
  const sourceCode = code || EMPTY_CODE;
  const [highlightedState, setHighlightedState] = useState<HighlightedCodeState>(() => ({
    sourceCode,
    result: createPlainCode(sourceCode),
  }));
  const highlightedCode = highlightedState.sourceCode === sourceCode
    ? highlightedState.result
    : createPlainCode(sourceCode);

  useEffect(() => {
    let active = true;

    void codeHighlighter.highlight({
      code: sourceCode,
      language: "typescript",
      theme: "dark",
    }).then((result) => {
      if (active) setHighlightedState({ sourceCode, result });
    }).catch(() => {
      if (active) {
        setHighlightedState({
          sourceCode,
          result: createPlainCode(sourceCode),
        });
      }
    });

    return () => {
      active = false;
    };
  }, [sourceCode]);

  return (
    <pre
      className="code-highlight"
      aria-label="TypeScript 代码"
      style={{ color: highlightedCode.foregroundColor }}
    >
      <code>
        {highlightedCode.lines.map((line, lineIndex) => (
          <Fragment key={lineIndex}>
            {line.map((token, tokenIndex) => (
              <span key={`${lineIndex}-${tokenIndex}`} style={getTokenStyle(token)}>{token.content}</span>
            ))}
            {lineIndex < highlightedCode.lines.length - 1 ? "\n" : null}
          </Fragment>
        ))}
      </code>
    </pre>
  );
};

export default CodeHighlighting;
