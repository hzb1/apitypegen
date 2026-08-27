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
  content?: Record<string, SwaggerMediaType | undefined>;
};

type SwaggerResponse = {
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
      if (entries.length === 0) return "Record<string, any>";

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
    if (operation?.requestBody && operation.requestBody.content) {
      const content = operation.requestBody.content;
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
    const response =
      responses["200"] || responses["201"] || responses.default || Object.values(responses)[0];

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

  getStructuredTypes(path: string, method: string): GeneratedTypes {
    this.usedDefinitions.clear();

    const pathItem = this.doc?.paths?.[path] as Record<string, SwaggerOperation | undefined> | undefined;
    const operation =
      pathItem && typeof pathItem === "object" ? pathItem[String(method).toLowerCase()] : undefined;

    if (!operation) {
      return { queryParams: "", requestBody: "", responseData: "", models: "" };
    }

    const queryParams = this.generateQueryParams(operation);
    const requestBody = this.generateRequestBody(operation);
    const responseData = this.generateResponse(operation);

    let models = "";
    for (const [name, schema] of this.usedDefinitions.entries()) {
      models += this.formatJSDoc(schema);
      models += `${this.exp}${this.options.useInterface ? "interface" : "type"} ${name} ${this.getTSType(
        schema,
      )}\n\n`;
    }

    return { queryParams, requestBody, responseData, models };
  }
}

export default SwaggerToTS;
