import {useMemo} from "react";
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import "./CodeHighlighting.css";

hljs.registerLanguage('typescript', typescript)

const CodeHighlighting = ({code}: { code?: string }) => {

  const htmlContent = useMemo(() => {
    if (!code) return '// 空的'

    return hljs.highlight(code, { language: 'typescript' }).value
  }, [code])

  return <pre className="ts-hljs-pre"><code className="hljs ts-hljs" dangerouslySetInnerHTML={{
    __html: htmlContent
  }}></code></pre>
}

export default CodeHighlighting;
