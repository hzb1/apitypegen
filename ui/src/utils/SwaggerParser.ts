import type { OpenAPI, OpenAPIV2, OpenAPIV3 } from 'openapi-types'

export interface GeneratorOptions {
  indent?: number
  useInterface?: boolean
  addExport?: boolean
  semicolon?: boolean
  typeNameMapper?: (rawName: string) => string
  int64ToString?: boolean
  showExample?: boolean
}

export interface GeneratedTypes {
  queryParams: string
  requestBody: string
  responseData: string
  models: string
}

// 定义 Schema 联合类型，涵盖 Swagger 2.0 和 OpenAPI 3.0
type SchemaObject = OpenAPIV2.SchemaObject | OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject

export class SwaggerToTS {
  private doc: OpenAPI.Document
  private options: Required<GeneratorOptions>
  // 存储已使用的定义，SchemaObject 替代 any
  private usedDefinitions = new Map<string, SchemaObject>()

  constructor(doc: OpenAPI.Document, options: GeneratorOptions = {}) {
    this.doc = doc
    this.options = {
      indent: options.indent ?? 2,
      useInterface: options.useInterface ?? true,
      addExport: options.addExport ?? true,
      semicolon: options.semicolon ?? true,
      typeNameMapper: options.typeNameMapper ?? ((name) => name),
      int64ToString: options.int64ToString ?? true,
      showExample: options.showExample ?? true,
    }
  }

  private get semi() { return this.options.semicolon ? ';' : '' }
  private get exp() { return this.options.addExport ? 'export ' : '' }

  private resolveRef(ref: string): { schema: SchemaObject; name: string } {
    const path = ref.replace(/^#\//, '')
    const parts = path.split('/')
    const rawName = parts[parts.length - 1]
    const mappedName = this.options.typeNameMapper(rawName)

    // 递归查找 doc 内部对象
    let current: unknown = this.doc
    for (const part of parts) {
      current = (current as Record<string, unknown>)?.[part]
    }

    const schema = current as SchemaObject
    if (schema && !this.usedDefinitions.has(mappedName)) {
      this.usedDefinitions.set(mappedName, schema)
      this.getTSType(schema)
    }

    return { schema, name: mappedName }
  }

  private formatJSDoc(
    doc: { summary?: string; description?: string; example?: unknown },
    indentDepth = 0,
  ): string {
    const lines: string[] = []
    const indent = ' '.repeat(this.options.indent * indentDepth)

    if (doc.summary) lines.push(doc.summary)
    if (doc.description) lines.push(doc.description)

    if (this.options.showExample && doc.example !== undefined) {
      const exampleStr = typeof doc.example === 'object' ? JSON.stringify(doc.example) : String(doc.example)
      lines.push(`@example ${exampleStr}`)
    }

    if (lines.length === 0) return ''
    if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`

    const content = lines.map((line) => `${indent} * ${line}`).join('\n')
    return `${indent}/**\n${content}\n${indent} */\n`
  }

  private getTSType(schema: SchemaObject | undefined, depth = 1): string {
    if (!schema) return 'any'

    // 处理引用
    if ('$ref' in schema) {
      return this.resolveRef(schema.$ref!).name
    }

    // 处理枚举
    if (schema.enum) {
      return schema.enum.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join(' | ')
    }

    // 处理数组
    if (schema.type === 'array' && schema.items) {
      return `${this.getTSType(schema.items as SchemaObject, depth)}[]`
    }

    // 处理对象
    if (schema.type === 'object' || schema.properties) {
      const properties = (schema.properties || {}) as Record<string, SchemaObject>
      const props = Object.entries(properties)
      if (props.length === 0) return 'Record<string, any>'

      let objStr = '{\n'
      const required = (schema.required as string[]) || []

      props.forEach(([key, prop]) => {
        const isRequired = required.includes(key)
        const indent = ' '.repeat(this.options.indent * depth)
        objStr += this.formatJSDoc(prop as { summary?: string }, depth)
        objStr += `${indent}${key}${isRequired ? '' : '?'}: ${this.getTSType(prop, depth + 1)}${this.semi}\n`
      })
      return objStr + ' '.repeat(this.options.indent * (depth - 1)) + '}'
    }

    // 处理数值
    if (schema.type === 'integer' || schema.type === 'number') {
      if (this.options.int64ToString && (schema as OpenAPIV3.SchemaObject).format === 'int64') {
        return 'string'
      }
      return 'number'
    }

    // 处理基本类型
    const typeMap: Record<string, string> = {
      string: 'string',
      boolean: 'boolean',
    }

    return typeMap[schema.type as string] || 'any'
  }

  public getStructuredTypes(path: string, method: string): GeneratedTypes {
    this.usedDefinitions.clear()

    // 获取 OperationObject，处理 v2/v3 路径结构差异
    const pathItem = this.doc.paths?.[path] as Record<string, unknown> | undefined
    const op = pathItem?.[method.toLowerCase()] as OpenAPIV3.OperationObject | OpenAPIV2.OperationObject | undefined

    if (!op) {
      return { queryParams: '', requestBody: '', responseData: '', models: '' }
    }

    const queryParams = this.generateQueryParams(op)
    const requestBody = this.generateRequestBody(op)
    const responseData = this.generateResponse(op)

    let models = ''
    this.usedDefinitions.forEach((schema, name) => {
      models += this.formatJSDoc(schema as { summary?: string })
      models += `${this.exp}${this.options.useInterface ? 'interface' : 'type'} ${name} ${this.getTSType(schema)}\n\n`
    })

    return { queryParams, requestBody, responseData, models }
  }

  private generateQueryParams(op: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject) {
    const params = (op.parameters as (OpenAPIV3.ParameterObject | OpenAPIV2.ParameterObject)[])?.filter(
      (p) => p.in !== 'body' && p.in !== 'header'
    ) || []

    if (!params.length) return '// 无查询参数'

    let code = `${this.exp}interface QueryParams {\n`
    params.forEach((p) => {
      // 兼容 V3 的 schema 和 V2 的直接属性
      const schema = 'schema' in p ? (p.schema as SchemaObject) : (p as SchemaObject)
      code += `  ${p.name}${p.required ? '' : '?'}: ${this.getTSType(schema, 2)}${this.semi}\n`
    })
    return code + '}'
  }

  private generateRequestBody(op: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject) {
    let schema: SchemaObject | undefined

    if ('requestBody' in op && op.requestBody) {
      // OpenAPI 3.0
      const content = (op.requestBody as OpenAPIV3.RequestBodyObject).content
      schema = content?.['application/json']?.schema
    } else if ('parameters' in op) {
      // Swagger 2.0
      const bodyParam = op.parameters?.find((p) => (p as OpenAPIV2.InBodyParameterObject).in === 'body') as OpenAPIV2.InBodyParameterObject
      schema = bodyParam?.schema
    }

    return schema
      ? `${this.exp}type RequestBody = ${this.getTSType(schema)}${this.semi}`
      : '// 无 Request Body'
  }

  private generateResponse(op: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject) {
    const responses = op.responses as Record<string, OpenAPIV3.ResponseObject | OpenAPIV2.ResponseObject>
    const res = responses?.['200'] || responses?.['201'] || responses?.default

    if (!res) return `${this.exp}type ResponseData = any${this.semi}`

    let schema: SchemaObject | undefined
    if ('content' in res && res.content) {
      schema = res.content['application/json']?.schema || Object.values(res.content)[0]?.schema
    } else if ('schema' in res) {
      schema = res.schema as SchemaObject
    }

    return schema
      ? `${this.exp}type ResponseData = ${this.getTSType(schema)}${this.semi}`
      : `${this.exp}type ResponseData = any${this.semi}`
  }
}
