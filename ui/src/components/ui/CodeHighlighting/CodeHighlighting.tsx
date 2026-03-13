import {useMemo} from "react";
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import 'highlight.js/styles/github.css'

hljs.registerLanguage('typescript', typescript)

const CodeHighlighting = ({code}: { code?: string }) => {

  const htmlContent = useMemo(() => {
    if (!code) return '// 空的'

    return hljs.highlight(code, { language: 'typescript' }).value
  }, [code])


  return <pre><code className="hljs" dangerouslySetInnerHTML={{
    __html: htmlContent
  }}></code></pre>
}

export default CodeHighlighting;
