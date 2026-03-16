import { useEffect, useMemo, useState } from 'react'
import type {GeneratorOptions} from "../utils/SwaggerParser.ts";

const STORAGE_KEY = 'swagger_config_v1'

type ArrayType = 'bracket' | string

type ConfigState = {
  indent: number
  useInterface: boolean
  addExport: boolean
  semicolon: boolean
  arrayType: ArrayType
  int64ToString: boolean
  namingStrategy: string
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
    namingStrategy: '',
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

  // 核心：转换给 SwaggerToTS 使用的配置对象
  const generatorOptions = useMemo<GeneratorOptions>(() => {
    const typeNameMapper = (name: string) => {
      if (configState.namingStrategy === 'removeVO') return name.replace(/VO$/i, '')
      if (configState.namingStrategy === 'removeDTO') return name.replace(/DTO$/i, '')
      if (configState.namingStrategy === 'prefixI') return 'I' + name
      return name
    }

    // 类型断言：GeneratorOptions 包含 configState 的字段 + typeNameMapper
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return { ...(configState as never), typeNameMapper } as GeneratorOptions
    // 只在 configState 改变时重新计算
  }, [configState])

  return { configState, setConfigState, generatorOptions }
}
