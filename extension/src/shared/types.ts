// ===== 基础 =====
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'

// ===== Request =====
export interface ProxyRequestMessage {
  type: 'PROXY_REQUEST' | 'PLUGIN_PING'
  requestId: string
  payload: RequestSpec
}

export interface RequestSpec {
  url: string
  method: HttpMethod | string
  headers?: Record<string, string>
  body?: RequestBody
  timeout?: number
}

export type RequestBody =
  | { type: 'json'; value: any }
  | { type: 'text'; value: string }
  | { type: 'form'; value: Record<string, string> }

// ===== Response =====
export interface ProxyResponseMessage {
  type: 'PROXY_RESPONSE'
  requestId: string
  result: ProxyResult
}

export type ProxyResult = ProxySuccess | ProxyFailure

export interface ProxySuccess {
  ok: true
  response: ResponseSpec
  timing: TimingInfo
}

export interface ProxyFailure {
  ok: false
  error: ErrorSpec
}

export interface ResponseSpec {
  url: string
  status: number
  statusText: string
  headers: Record<string, string>
  /** 原始 Set-Cookie 数组（保留多条） */
  setCookies?: string[]
  body: ResponseBody
}

export type ResponseBody =
  | { type: 'json'; value: any }
  | { type: 'text'; value: string }
  | { type: 'base64'; value: string; mimeType?: string }

export interface TimingInfo {
  startTime: number
  endTime: number
  duration: number
}

export interface ErrorSpec {
  type: 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_URL' | 'UNKNOWN'
  message: string
}

export class ProxyError extends Error {
  public type: ErrorSpec['type'];
  readonly original: ErrorSpec;

  constructor(errorSpec: ErrorSpec) {
    super(errorSpec.message);
    this.name = 'ProxyError';
    this.type = errorSpec.type;
    this.original = errorSpec;

    // 修复 TS 继承 Error 时的原型链问题
    Object.setPrototypeOf(this, ProxyError.prototype);
  }
}
