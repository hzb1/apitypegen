import { useEffect, useMemo, useState } from 'react'
import type {GeneratorOptions} from "../utils/SwaggerParser.ts";

const STORAGE_KEY = 'swagger_config_v1'

const defaultTemplate = (ctx: {
  method: string
  url: string
  functionName: string
  queryParamsType: string
  requestBodyType: string
  responseDataType: string
  hasQuery?: boolean
  hasBody?: boolean
}) => {
  const { method, url, functionName, queryParamsType, requestBodyType, responseDataType, hasQuery, hasBody } = ctx

  const args: string[] = []
  // 如果有 path 参数或 query 参数，统一用 params
  if (hasQuery) args.push(`params: ${queryParamsType}`)
  if (hasBody) args.push(`data: ${requestBodyType}`)

  return `export const ${functionName} = (${args.join(', ')}) => {
  return request.${method}<${responseDataType}>(\`${url}\`, { 
    ${hasBody ? 'data,' : ''} 
    ${hasQuery ? 'params,' : ''} 
  });
};`
}

type ArrayType = 'bracket' | string

type RequestTemplateRaw = GeneratorOptions['requestTemplate'] | string

type ConfigState = {
  indent: number
  useInterface: boolean
  addExport: boolean
  semicolon: boolean
  arrayType: ArrayType
  int64ToString: boolean
  namingStrategy: string
  requestTemplateRaw: RequestTemplateRaw
  showExample: boolean
}

export function useOptions() {
  const [configState, setConfigState] = useState<ConfigState>({
    indent: 2,
    useInterface: true,
    addExport: true,
    semicolon: true,
    arrayType: 'bracket',
    int64ToString: true,
    namingStrategy: 'removeVO',
    requestTemplateRaw: defaultTemplate,
    showExample: true, // 默认开启
  })

  // 初始化加载（componentDidMount）
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setConfigState(prev => ({ ...prev, ...parsed }))
      } catch {
        // ignore parse error
      }
    }

  }, [])

  // 持久化监听（当 configState 改变时写入 localStorage）
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configState))
    } catch {
      // ignore storage errors
    }
  }, [configState])

  const resetTemplate = () => {
    if (typeof window !== 'undefined' && window.confirm('重置模板？')) {
      setConfigState(prev => ({ ...prev, requestTemplateRaw: defaultTemplate }))
    }
  }

  // 核心：转换给 SwaggerToTS 使用的配置对象
  const generatorOptions = useMemo<GeneratorOptions>(() => {
    const typeNameMapper = (name: string) => {
      if (configState.namingStrategy === 'removeVO') return name.replace(/VO$/i, '')
      if (configState.namingStrategy === 'removeDTO') return name.replace(/DTO$/i, '')
      if (configState.namingStrategy === 'prefixI') return 'I' + name
      return name
    }

    let requestTemplate: GeneratorOptions['requestTemplate'] | undefined
    try {
      if (typeof configState.requestTemplateRaw === 'function') {
        requestTemplate = configState.requestTemplateRaw
      } else if (typeof configState.requestTemplateRaw === 'string') {
        // eval 字符串以得到函数
        const evaluated = eval(configState.requestTemplateRaw)
        if (typeof evaluated === 'function') {
          requestTemplate = evaluated as GeneratorOptions['requestTemplate']
        }
      }
    } catch (e) {
      // 保持与原实现一致：打印错误并继续

      console.error('Template eval error:', e)
    }

    // 类型断言：GeneratorOptions 包含 configState 的字段 + typeNameMapper + requestTemplate
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return { ...(configState as never), typeNameMapper, requestTemplate } as GeneratorOptions
    // 只在 configState 改变时重新计算
  }, [configState])

  return { configState, setConfigState, generatorOptions, resetTemplate }
}
