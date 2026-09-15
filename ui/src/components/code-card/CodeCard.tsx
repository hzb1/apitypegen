import CopyIcon from "../CopyIcon.tsx";
import React, { Suspense, lazy } from "react";
import copyToClipboard from "../../utils/copyToClipboard/copyToClipboard.ts";
import "./CodeCard.css";

const CodeHighlighting = lazy(() => import("../ui/CodeHighlighting/CodeHighlighting.tsx"));

/**
 * 代码卡片的高度分配方式。
 *
 * - `content`：根据代码行数计算主体高度。
 * - `fill`：占用父容器分配的全部剩余高度。
 */
type CodeCardHeightMode = "content" | "fill";

/** TypeScript 代码卡片的输入。 */
type CodeCardProps = {
  /** 代码区域标题。 */
  title: string;
  /** 需要展示和复制的 TypeScript 代码。 */
  code?: string;
  /** 卡片根元素的补充样式。 */
  style?: React.CSSProperties;
  /** 代码区域最多显示的行数，超出后在编辑器内滚动。 */
  maxVisibleLines?: number;
  /** 代码卡片使用内容高度还是填满父容器剩余高度。 */
  heightMode?: CodeCardHeightMode;
  /** 卡片各区域的补充样式。 */
  styles?: {
    /** 代码主体区域的补充样式。 */
    body?: React.CSSProperties;
  };
};

const CodeCard: React.FC<CodeCardProps> = ({
  title,
  code,
  style,
  maxVisibleLines = 18,
  heightMode = "content",
  styles,
}: CodeCardProps) => {
  const fallbackCode = code || "// 空的";
  const visibleLineCount = Math.min(Math.max(fallbackCode.split("\n").length, 4), maxVisibleLines);
  const calculatedBodyHeight = 32 + visibleLineCount * 20;
  const cardClassName = heightMode === "fill" ? "code-card code-card--fill" : "code-card";
  const cardStyle = {
    "--code-card-body-height": `${calculatedBodyHeight}px`,
    ...style,
  } as React.CSSProperties;

  const handleCopy = async () => {
    if (!code) return;
    await copyToClipboard(code);
    // if (b) {
    //   messageApi.success('已复制');
    // }
  };

  return (
    <div style={cardStyle} className={cardClassName}>
      <div className="code-card-head">
        <div className="code-card-title">{title}</div>
        <div className="code-card-action">
          <CopyIcon onClick={() => handleCopy()} />
        </div>
      </div>

      <div className="code-card-body" style={styles?.body}>
        <div className="code-card-panel">
          <div className="code-card-code">
            <Suspense fallback={<pre><code>{fallbackCode}</code></pre>}>
              <CodeHighlighting code={code} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeCard;
