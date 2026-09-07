export interface GeneratorOptions {
  indent?: number;
  useInterface?: boolean;
  addExport?: boolean;
  semicolon?: boolean;
  typeNameMapper?: (rawName: string) => string;
  int64ToString?: boolean;
  showExample?: boolean;
}

export interface GeneratedTypes {
  queryParams: string;
  requestBody: string;
  responseData: string;
  /** 按 HTTP 状态码拆分的响应类型。 */
  responses: GeneratedResponse[];
  models: string;
}

/** 单个 HTTP 响应的生成结果。 */
export interface GeneratedResponse {
  /** 响应状态码或 default。 */
  status: string;
  /** OpenAPI 响应描述。 */
  description: string;
  /** 响应数据类型代码。 */
  code: string;
  /** 请求参数、请求体与本状态响应实际依赖的模型代码，包含传递引用。 */
  models: string;
}

type SwaggerSchema = {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: SwaggerSchema;
  properties?: Record<string, SwaggerSchema | undefined>;
  required?: string[];
  summary?: string;
  description?: string;
  example?: unknown;
  [key: string]: unknown;
};

type SwaggerParameter = {
  in?: string;
  name?: string;
  required?: boolean;
  schema?: SwaggerSchema;
  [key: string]: unknown;
};

type SwaggerMediaType = {
  schema?: SwaggerSchema;
};

type SwaggerRequestBody = {
  $ref?: string;
  content?: Record<string, SwaggerMediaType | undefined>;
};

type SwaggerResponse = {
  $ref?: string;
  description?: string;
  content?: Record<string, SwaggerMediaType | undefined>;
  schema?: SwaggerSchema;
};

type SwaggerOperation = {
  parameters?: SwaggerParameter[];
  requestBody?: SwaggerRequestBody;
  responses?: Record<string, SwaggerResponse | undefined>;
};

type SwaggerDocument = {
  paths?: Record<string, unknown>;
  components?: Record<string, Record<string, unknown> | undefined>;
};

const DEFAULT_OPTIONS: Required<GeneratorOptions> = {
  indent: 2,
  useInterface: true,
  addExport: true,
  semicolon: true,
  typeNameMapper: (name) => name,
  int64ToString: true,
  showExample: true,
};

export class SwaggerToTS {
  private readonly doc: SwaggerDocument;
  private readonly options: Required<GeneratorOptions>;
  private readonly usedDefinitions = new Map<string, SwaggerSchema>();

  constructor(doc: unknown, options: GeneratorOptions = {}) {
    this.doc = doc && typeof doc === "object" ? (doc as SwaggerDocument) : {};
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      typeNameMapper: options.typeNameMapper ?? DEFAULT_OPTIONS.typeNameMapper,
    };
  }

  private get semi(): string {
    return this.options.semicolon ? ";" : "";
  }

  private get exp(): string {
    return this.options.addExport ? "export " : "";
  }

  private resolveRef(ref: string): { schema: SwaggerSchema | undefined; name: string } {
    const refPath = ref.replace(/^#\//, "");
    const parts = refPath.split("/");
    const rawName = parts[parts.length - 1] || "UnknownModel";
    const mappedName = this.options.typeNameMapper(rawName);

    let current: unknown = this.doc;
    for (const part of parts) {
      if (!current || typeof current !== "object") {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }

    const schema = current as SwaggerSchema | undefined;
    if (schema && !this.usedDefinitions.has(mappedName)) {
      this.usedDefinitions.set(mappedName, schema);
      this.getTSType(schema);
    }

    return { schema, name: mappedName };
  }

  private resolveComponent<T extends object>(value: T | undefined): T | undefined {
    if (!value || typeof value !== "object" || !("$ref" in value)) return value;
    const ref = String((value as { $ref?: string }).$ref || "");
    if (!ref.startsWith("#/components/")) return value;
    const [, , section, name] = ref.split("/");
    const resolved = this.doc.components?.[section]?.[name];
    return resolved && typeof resolved === "object" ? resolved as T : value;
  }

  private formatJSDoc(doc: SwaggerSchema, indentDepth = 0): string {
    const lines: string[] = [];
    const indent = " ".repeat(this.options.indent * indentDepth);

    if (doc?.summary) lines.push(doc.summary);
    if (doc?.description) lines.push(doc.description);

    if (this.options.showExample && doc?.example !== undefined) {
      const exampleStr =
        typeof doc.example === "object" ? JSON.stringify(doc.example) : String(doc.example);
      lines.push(`@example ${exampleStr}`);
    }

    if (lines.length === 0) return "";
    if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`;

    const content = lines.map((line) => `${indent} * ${line}`).join("\n");
    return `${indent}/**\n${content}\n${indent} */\n`;
  }

  private getTSType(schema: SwaggerSchema | undefined, depth = 1): string {
    if (!schema) return "any";

    if (schema.$ref) {
      return this.resolveRef(schema.$ref).name;
    }

    if (schema.nullable === true) {
      const base = this.getTSType({ ...schema, nullable: undefined }, depth);
      return `${base} | null`;
    }

    if (Array.isArray(schema.oneOf) && schema.oneOf.length) {
      return schema.oneOf.map((item) => this.getTSType(item as SwaggerSchema, depth)).join(" | ");
    }
    if (Array.isArray(schema.anyOf) && schema.anyOf.length) {
      return schema.anyOf.map((item) => this.getTSType(item as SwaggerSchema, depth)).join(" | ");
    }
    if (Array.isArray(schema.allOf) && schema.allOf.length) {
      return schema.allOf.map((item) => this.getTSType(item as SwaggerSchema, depth)).join(" & ");
    }

    if (schema.enum && Array.isArray(schema.enum)) {
      return schema.enum
        .map((value) => (typeof value === "string" ? `'${value}'` : String(value)))
        .join(" | ");
    }

    if (schema.type === "array" && schema.items) {
      return `${this.getTSType(schema.items, depth)}[]`;
    }

    if (schema.type === "object" || schema.properties) {
      const properties = schema.properties || {};
      const entries = Object.entries(properties);
      if (entries.length === 0 && schema.additionalProperties && typeof schema.additionalProperties === "object") {
        return `Record<string, ${this.getTSType(schema.additionalProperties as SwaggerSchema, depth)}>`;
      }
      if (entries.length === 0) return "Record<string, unknown>";

      let objectString = "{\n";
      const requiredSet = new Set(Array.isArray(schema.required) ? schema.required : []);
      for (const [key, prop] of entries) {
        const indent = " ".repeat(this.options.indent * depth);
        const optionalFlag = requiredSet.has(key) ? "" : "?";
        objectString += this.formatJSDoc(prop || {}, depth);
        objectString += `${indent}${key}${optionalFlag}: ${this.getTSType(
          prop,
          depth + 1,
        )}${this.semi}\n`;
      }

      return objectString + " ".repeat(this.options.indent * (depth - 1)) + "}";
    }

    if (schema.type === "integer" || schema.type === "number") {
      if (this.options.int64ToString && schema.format === "int64") {
        return "string";
      }
      return "number";
    }

    const primitiveMap: Record<string, string> = {
      string: "string",
      boolean: "boolean",
    };
    return primitiveMap[schema.type || ""] || "any";
  }

  private generateQueryParams(operation: SwaggerOperation): string {
    const params = Array.isArray(operation?.parameters)
      ? operation.parameters.filter((item) => item && item.in !== "body" && item.in !== "header")
      : [];

    if (!params.length) return "// 无查询参数";

    let code = `${this.exp}interface QueryParams {\n`;
    for (const item of params) {
      const schema = item.schema || (item as SwaggerSchema);
      code += `  ${item.name || "unknown"}${item.required ? "" : "?"}: ${this.getTSType(
        schema,
        2,
      )}${this.semi}\n`;
    }
    return `${code}}`;
  }

  private generateRequestBody(operation: SwaggerOperation): string {
    let schema: SwaggerSchema | undefined;
    const requestBody = this.resolveComponent(operation?.requestBody);
    if (requestBody && requestBody.content) {
      const content = requestBody.content;
      schema = content["application/json"]?.schema;
      if (!schema) {
        const firstContent = Object.values(content).find((item) => item?.schema);
        schema = firstContent?.schema;
      }
    } else if (Array.isArray(operation?.parameters)) {
      const bodyParam = operation.parameters.find((item) => item?.in === "body");
      schema = bodyParam?.schema;
    }

    return schema
      ? `${this.exp}type RequestBody = ${this.getTSType(schema)}${this.semi}`
      : "// 无请求体";
  }

  private generateResponse(operation: SwaggerOperation): string {
    const responses =
      operation && typeof operation.responses === "object" && operation.responses
        ? operation.responses
        : {};
    const response = this.resolveComponent(
      responses["200"] || responses["201"] || responses.default || Object.values(responses)[0],
    );

    if (!response) return `${this.exp}type ResponseData = any${this.semi}`;

    let schema: SwaggerSchema | undefined;
    if (response.content) {
      schema =
        response.content["application/json"]?.schema ||
        Object.values(response.content)[0]?.schema;
    } else if (response.schema) {
      schema = response.schema;
    }

    return schema
      ? `${this.exp}type ResponseData = ${this.getTSType(schema)}${this.semi}`
      : `${this.exp}type ResponseData = any${this.semi}`;
  }

  private generateResponses(operation: SwaggerOperation): GeneratedResponse[] {
    const responses = operation.responses || {};
    // 请求参数和请求体始终显示；每个响应从这份公共依赖开始，避免混入其他状态的模型。
    const sharedDefinitions = new Map(this.usedDefinitions);
    const allDefinitions = new Map(sharedDefinitions);
    const generated = Object.entries(responses).map(([status, response]) => {
      this.usedDefinitions.clear();
      for (const [name, schema] of sharedDefinitions) this.usedDefinitions.set(name, schema);

      const code = response
        ? this.generateResponse({ responses: { [status]: response } })
        : `${this.exp}type ResponseData = unknown${this.semi}`;
      const models = this.generateModels();
      for (const [name, schema] of this.usedDefinitions) allDefinitions.set(name, schema);
      return { status, description: response?.description || "", code, models };
    });

    this.usedDefinitions.clear();
    for (const [name, schema] of allDefinitions) this.usedDefinitions.set(name, schema);
    return generated;
  }

  getStructuredTypes(path: string, method: string): GeneratedTypes {
    this.usedDefinitions.clear();

    const pathItem = this.doc?.paths?.[path] as Record<string, SwaggerOperation | undefined> | undefined;
    const operation =
      pathItem && typeof pathItem === "object" ? pathItem[String(method).toLowerCase()] : undefined;

    if (!operation) {
      return { queryParams: "", requestBody: "", responseData: "", responses: [], models: "" };
    }

    const queryParams = this.generateQueryParams(operation);
    const requestBody = this.generateRequestBody(operation);
    const responses = this.generateResponses(operation);
    const responseData = this.generateResponse(operation);
    const models = this.generateModels();

    return { queryParams, requestBody, responseData, responses, models };
  }

  private generateModels(): string {
    let models = "";
    for (const [name, schema] of this.usedDefinitions.entries()) {
      models += this.formatJSDoc(schema);
      const schemaType = this.getTSType(schema);
      const isObjectSchema = schema.type === "object" || Boolean(schema.properties);
      const needsTypeAlias = Boolean(
        schema.enum || schema.oneOf || schema.anyOf || schema.allOf || !isObjectSchema,
      );
      const declaration = this.options.useInterface && !needsTypeAlias ? "interface" : "type";
      models += declaration === "interface"
        ? `${this.exp}interface ${name} ${schemaType}\n\n`
        : `${this.exp}type ${name} = ${schemaType}${this.semi}\n\n`;
    }

    return models;
  }
}

export default SwaggerToTS;
