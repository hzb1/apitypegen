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

export declare class SwaggerToTS {
  constructor(doc: unknown, options?: GeneratorOptions);
  getStructuredTypes(path: string, method: string): GeneratedTypes;
}

export default SwaggerToTS;
