export type TsSwaggerExport = {
  exportVersion: "1.0";
  appVersion: string;
  exportedAt: string;
  source: {
    docUrl: string;
    serviceUrl?: string;
    apiBaseUrl?: string;
    title?: string;
    version?: string;
    importedFileName?: string;
  };
  generatorOptions: Record<string, unknown>;
  openapi: unknown;
  groups: Array<{
    id: string;
    name: string;
    apiKeys: string[];
  }>;
  apis: Array<{
    key: string;
    method: string;
    path: string;
    fullUrl: string;
    summary?: string;
    description?: string;
    operationId?: string;
    tags: string[];
    parameters: unknown[];
    requestBody?: unknown;
    responses?: unknown;
    tsCode: {
      models: string;
      queryParams: string;
      requestBody: string;
      responseData: string;
    };
  }>;
  services?: Array<{
    name: string;
    url: string;
    apiBaseUrl?: string;
    openapi: unknown;
    groups: TsSwaggerExport["groups"];
    apis: TsSwaggerExport["apis"];
  }>;
};

export type SavedApiExport = {
  id: string;
  name: string;
  fingerprint: string;
  savedAt: string;
  updatedAt: string;
  apiCount: number;
  sourceTitle?: string;
  sourceDocUrl?: string;
  payload: TsSwaggerExport;
};

export type SaveApiExportResult = {
  record: SavedApiExport;
  created: boolean;
};

export type ImportApiExportResult = {
  payload: TsSwaggerExport;
  format: "ts-swagger-export" | "openapi";
  name: string;
};
