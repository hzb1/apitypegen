import CopyIcon from "../CopyIcon.tsx";
import React, { Suspense, lazy } from "react";
import copyToClipboard from "../../utils/copyToClipboard/copyToClipboard.ts";

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
    <>
      <div
        style={style}
        className={
          "code-group p-0.5 flex flex-col not-prose relative overflow-hidden rounded-2xl border border-gray-950/10 dark:border-white/10 my-0 bg-gray-50 dark:bg-white/5 dark:codeblock-dark text-gray-950 dark:text-gray-50 codeblock-light"
        }
      >
        <div
          className={"flex items-center justify-between gap-2 relative px-2.5"}
        >
          <div
            className={"flex items-center gap-1.5 text-xs font-medium min-w-0"}
          >
            <div className={"truncate text-gray-950 dark:text-gray-50"}>
              {title}
            </div>
          </div>
          <div className={"flex items-center justify-end shrink-0 gap-1.5"}>
            <CopyIcon onClick={() => handleCopy()} />
          </div>
        </div>

        <div className={"flex flex-1 overflow-hidden"} style={styles?.body}>
          <div
            className={
              "w-full min-w-full max-w-full h-full max-h-full relative"
            }
          >
            <div
              className={
                "w-0 min-w-full max-w-full py-3.5 px-4 h-full dark:bg-codeblock relative text-sm leading-6 children:!my-0 children:!shadow-none children:!bg-transparent transition-[height] duration-300 ease-in-out code-block-background [&_*]:ring-0 [&_*]:outline-0 [&_*]:focus:ring-0 [&_*]:focus:outline-0 rounded-xt bg-white overflow-auto overflow-x-auto scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-black/15 hover:scrollbar-thumb-black/20 active:scrollbar-thumb-black/20 dark:scrollbar-thumb-white/20 dark:hover:scrollbar-thumb-white/25 dark:active:scrollbar-thumb-white/25"
              }
            >
              <div
                className={
                  "font-mono whitespace-pre flex-none h-full text-xs leading-[1.35rem]"
                }
              >
                <Suspense fallback={<pre><code>{fallbackCode}</code></pre>}>
                  <CodeHighlighting code={code} />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CodeCard;
