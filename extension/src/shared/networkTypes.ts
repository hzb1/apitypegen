// 目标：定义一个接近 Chrome Network 面板的数据结构。
// 说明：每个字段都配有用途说明，便于后续逐步补齐数据来源。

// 资源类型尽量对齐 Chrome 的分类
export type ResourceType =
  | 'document'
  | 'stylesheet'
  | 'image'
  | 'media'
  | 'font'
  | 'script'
  | 'xhr'
  | 'fetch'
  | 'websocket'
  | 'other'

export interface NetworkEntry {
  /** 唯一主键，用于列表渲染/索引/去重 */
  id: string
  /** 业务请求 ID（通常与一次 proxyFetch 绑定） */
  requestId: string
  /** 请求 URL */
  url: string
  /** 请求方法，例如 GET/POST */
  method: string
  /** 资源类型，用于列表筛选和图标展示 */
  resourceType: ResourceType
  /** 请求开始时间（毫秒时间戳） */
  startTime: number
  /** 请求结束时间（毫秒时间戳） */
  endTime?: number
  /** 总耗时（毫秒） */
  duration?: number

  /** 请求相关信息（Headers/Body/Cookies 等） */
  request: NetworkRequest
  /** 响应相关信息（Headers/Body/Cookies 等） */
  response?: NetworkResponse
  /** 细分耗时信息（DNS/SSL/TTFB 等） */
  timing?: NetworkTiming
  /** 启动器信息（脚本/解析器/预加载） */
  initiator?: NetworkInitiator
  /** 连接信息（协议/IP/端口/复用） */
  connection?: NetworkConnection
  /** 安全信息（证书/协议/有效期） */
  security?: NetworkSecurity
  /** 缓存信息（Cache-Control/ETag 等） */
  cache?: NetworkCache
  /** 各种大小（请求/响应/编码/解码） */
  sizes?: NetworkSizes
  /** 重定向链信息 */
  redirect?: NetworkRedirect
  /** 错误信息（网络/超时/未知） */
  error?: NetworkError

  /** 业务扩展字段（不会影响 UI 主流程） */
  meta?: Record<string, any>
}

export interface NetworkRequest {
  /** 结构化请求头，方便分组展示 */
  headers: Header[]
  /** 原始请求头文本（如果能拿到） */
  headersText?: string
  /** 结构化请求 Cookie */
  cookies?: NetworkCookie[]
  /** URL Query 参数 */
  queryString?: NameValue[]
  /** 请求体（JSON/文本/表单/文件） */
  postData?: RequestBody
  /** Referrer */
  referrer?: string
  /** User-Agent */
  userAgent?: string
  /** 优先级（与 Chrome Network 类似） */
  priority?: 'VeryHigh' | 'High' | 'Medium' | 'Low' | 'VeryLow'
  /** 请求体大小（字节） */
  bodySize?: number
  /** 请求内容类型（如 application/json） */
  mimeType?: string
}

export interface NetworkResponse {
  /** HTTP 状态码 */
  status: number
  /** HTTP 状态文本 */
  statusText: string
  /** 结构化响应头 */
  headers: Header[]
  /** 原始响应头文本（如果能拿到） */
  headersText?: string
  /** 结构化响应 Cookie（来自 Set-Cookie） */
  cookies?: NetworkCookie[]
  /** 响应内容类型 */
  mimeType?: string
  /** HTTP 协议版本 */
  httpVersion?: string
  /** 远端 IP */
  remoteIPAddress?: string
  /** 远端端口 */
  remotePort?: number
  /** 是否来自磁盘缓存 */
  fromDiskCache?: boolean
  /** 是否来自 Service Worker */
  fromServiceWorker?: boolean
  /** 是否来自 Prefetch 缓存 */
  fromPrefetchCache?: boolean
  /** 编码后的传输大小（字节） */
  encodedDataLength?: number
  /** 响应内容（文本/JSON/Base64 等） */
  content?: ResponseContent
}

export interface ResponseContent {
  /** 解码后的内容大小（字节） */
  size?: number
  /** 编码后的内容大小（字节） */
  encodedSize?: number
  /** 内容类型 */
  mimeType?: string
  /** 文本内容（适用于 text/*） */
  text?: string
  /** Base64 内容（适用于二进制） */
  base64?: string
  /** 解析后的 JSON（如果可解析） */
  json?: any
  /** 内容编码 */
  encoding?: 'utf-8' | 'base64'
}

export interface RequestBody {
  /** 内容类型（如 application/json） */
  mimeType?: string
  /** 文本形式的 body */
  text?: string
  /** 解析后的 JSON */
  json?: any
  /** 表单参数 */
  params?: NameValue[]
  /** 文件信息（如果是上传） */
  files?: FileSpec[]
  /** 编码方式 */
  encoding?: 'utf-8' | 'base64'
}

export interface NetworkTiming {
  /** 请求开始时间（毫秒时间戳） */
  startTime: number
  /** 请求结束时间（毫秒时间戳） */
  endTime?: number
  /** 总耗时（毫秒） */
  duration?: number
  /** 排队/阻塞耗时 */
  blocked?: number
  /** DNS 耗时 */
  dns?: number
  /** TCP 建连耗时 */
  connect?: number
  /** SSL 握手耗时 */
  ssl?: number
  /** 发送请求耗时 */
  send?: number
  /** 等待首包（TTFB）耗时 */
  wait?: number
  /** 接收响应耗时 */
  receive?: number
  /** 首字节时间（如果单独统计） */
  ttfb?: number
}

export interface NetworkInitiator {
  /** 启动类型（脚本/解析器/预加载/其他） */
  type: 'script' | 'parser' | 'preload' | 'other'
  /** 启动器 URL */
  url?: string
  /** 启动器行号 */
  lineNumber?: number
  /** 启动器列号 */
  columnNumber?: number
  /** 启动调用栈 */
  stack?: StackFrame[]
}

export interface StackFrame {
  /** 函数名 */
  functionName?: string
  /** 源文件 URL */
  url?: string
  /** 行号 */
  lineNumber?: number
  /** 列号 */
  columnNumber?: number
}

export interface NetworkConnection {
  /** 连接 ID（用于复用识别） */
  id?: string
  /** 是否复用连接 */
  reused?: boolean
  /** 传输协议（如 h2、http/1.1） */
  protocol?: string
  /** 远端 IP */
  remoteIPAddress?: string
  /** 远端端口 */
  remotePort?: number
}

export interface NetworkSecurity {
  /** 安全状态 */
  state?: 'secure' | 'insecure' | 'warning' | 'unknown'
  /** 协议（如 TLS 1.3） */
  protocol?: string
  /** 颁发机构 */
  issuer?: string
  /** 证书生效时间（毫秒时间戳） */
  validFrom?: number
  /** 证书过期时间（毫秒时间戳） */
  validTo?: number
  /** 证书主体 */
  subjectName?: string
  /** 证书 SAN 列表 */
  sanList?: string[]
}

export interface NetworkCache {
  /** Cache-Control */
  cacheControl?: string
  /** ETag */
  etag?: string
  /** Last-Modified */
  lastModified?: string
  /** Expires */
  expires?: string
  /** Age */
  age?: number
  /** 是否从缓存命中 */
  servedFromCache?: boolean
}

export interface NetworkSizes {
  /** 请求头大小（字节） */
  headersSize?: number
  /** 请求体大小（字节） */
  requestBodySize?: number
  /** 响应体大小（字节） */
  responseBodySize?: number
  /** 传输编码后大小（字节） */
  encodedDataLength?: number
  /** 解码后大小（字节） */
  decodedBodySize?: number
}

export interface NetworkRedirect {
  /** 重定向来源 URL */
  fromUrl?: string
  /** 重定向目标 URL */
  toUrl?: string
  /** 重定向状态码 */
  status?: number
  /** 前一个请求 ID */
  redirectedFromId?: string
  /** 下一个请求 ID */
  redirectedToId?: string
  /** 重定向链（URL 列表） */
  chain?: string[]
}

export interface NetworkError {
  /** 错误类型 */
  type: 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_URL' | 'UNKNOWN'
  /** 错误信息 */
  message: string
}

export interface Header {
  /** Header 名 */
  name: string
  /** Header 值 */
  value: string
  /** 原始 Header 值（可选，用于区分大小写/保留空白） */
  valueRaw?: string
}

export interface NetworkCookie {
  /** Cookie 名 */
  name: string
  /** Cookie 值 */
  value: string
  /** Cookie 域 */
  domain?: string
  /** Cookie 路径 */
  path?: string
  /** 过期时间（毫秒时间戳） */
  expires?: number
  /** 是否 HttpOnly */
  httpOnly?: boolean
  /** 是否 Secure */
  secure?: boolean
  /** SameSite 策略 */
  sameSite?: 'Strict' | 'Lax' | 'None'
  /** Cookie 大小（字节） */
  size?: number
}

export interface NameValue {
  /** 参数名 */
  name: string
  /** 参数值 */
  value: string
}

export interface FileSpec {
  /** 表单字段名 */
  name: string
  /** 文件名 */
  fileName?: string
  /** 文件类型 */
  mimeType?: string
  /** 文件大小（字节） */
  size?: number
}
