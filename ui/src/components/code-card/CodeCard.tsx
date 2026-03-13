import CopyIcon from "../CopyIcon.tsx";
import React, { Suspense, lazy } from "react";
import copyToClipboard from "../../utils/copyToClipboard/copyToClipboard.ts";
import "./CodeCard.css";

const CodeHighlighting = lazy(() => import("../ui/CodeHighlighting/CodeHighlighting.tsx"));

type CodeCardProps = {
  title: string;
  code?: string;
  style?: React.CSSProperties;
  styles?: {
    body?: React.CSSProperties;
  };
};

const CodeCard: React.FC<CodeCardProps> = ({
  title,
  code,
  style,
  styles,
}: CodeCardProps) => {
  const fallbackCode = code || "// 空的";

  const handleCopy = async () => {
    if (!code) return;
    await copyToClipboard(code);
    // if (b) {
    //   messageApi.success('已复制');
    // }
  };

  return (
    <div style={style} className="code-card">
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
