import type {
  RequestSpec,
  ProxyResult,
  ProxyResponseMessage,
  TimingInfo,
  ErrorSpec,
  ResponseBody
} from './types'

import type {
  NetworkEntry,
  NetworkRequest,
  NetworkResponse,
  NetworkTiming,
  NetworkError,
  NetworkSizes,
  ResponseContent,
  RequestBody,
  NameValue,
  Header,
  NetworkCookie,
  ResourceType,
  NetworkInitiator,
  NetworkConnection,
  NetworkSecurity,
  NetworkCache,
  NetworkRedirect
} from './networkTypes'

export interface ProxyExchangeInput {
  requestId: string
  request: RequestSpec
  result: ProxyResult
  /** 失败场景下可选补充 timing */
  timing?: TimingInfo
}

export interface MapProxyOptions {
  /** 强制指定资源类型（覆盖自动推断） */
  resourceType?: ResourceType
  /** 失败场景的补充 timing（优先级低于 input.timing） */
  timing?: TimingInfo
  /** 可选补充的扩展信息 */
  initiator?: NetworkInitiator
  connection?: NetworkConnection
  security?: NetworkSecurity
  cache?: NetworkCache
  redirect?: NetworkRedirect
  sizes?: NetworkSizes
  meta?: Record<string, any>
}

export function mapProxyResponseMessageToNetworkEntry(
  msg: ProxyResponseMessage,
  request: RequestSpec,
  options?: MapProxyOptions
): NetworkEntry {
  return mapProxyExchangeToNetworkEntry(
    {
      requestId: msg.requestId,
      request,
      result: msg.result
    },
    options
  )
}

export function mapProxyExchangeToNetworkEntry(
  input: ProxyExchangeInput,
  options?: MapProxyOptions
): NetworkEntry {
  const { requestId, request, result } = input
  const ok = result.ok

  const timing = ok
    ? result.timing
    : (input.timing || options?.timing)

  const startTime = timing?.startTime ?? Date.now()
  const endTime = timing?.endTime
  const duration = timing?.duration

  const url = ok ? result.response.url : request.url
  const method = request.method

  const requestHeaders = toHeadersArray(request.headers)
  const requestMimeType = pickMimeType(requestHeaders) || inferRequestMimeType(request)
  const requestContentLength = parseContentLength(requestHeaders)

  const requestBody = toRequestBody(request)
  const requestBodyText = serializeRequestBodyText(request)
  const requestBodySize = requestBodyText
    ? byteLength(requestBodyText)
    : requestContentLength

  const requestCookies = parseRequestCookies(requestHeaders)
  const queryString = parseQueryString(request.url)

  const baseRequest: NetworkRequest = {
    headers: requestHeaders,
    cookies: requestCookies.length ? requestCookies : undefined,
    queryString: queryString.length ? queryString : undefined,
    postData: requestBody,
    referrer: pickHeaderValue(requestHeaders, 'referer') || pickHeaderValue(requestHeaders, 'referrer'),
    userAgent: pickHeaderValue(requestHeaders, 'user-agent'),
    bodySize: requestBodySize,
    mimeType: requestMimeType
  }

  let response: NetworkResponse | undefined
  let error: NetworkError | undefined

  if (ok) {
    const responseHeaders = toHeadersArray(result.response.headers)
    const responseMimeType = pickMimeType(responseHeaders)
    const responseContent = toResponseContent(result.response.body, responseMimeType)
    const responseContentLength = parseContentLength(responseHeaders)
    const responseEncodedSize = responseContentLength ?? responseContent.encodedSize
    if (responseEncodedSize !== undefined) {
      responseContent.encodedSize = responseEncodedSize
    }
    if (responseContent.size === undefined && responseContentLength !== undefined) {
      responseContent.size = responseContentLength
    }

    const responseBody = result.response.body

    response = {
      status: result.response.status,
      statusText: result.response.statusText,
      headers: responseHeaders,
      cookies: parseResponseCookies(responseHeaders, result.response.setCookies),
      mimeType:
        responseMimeType ||
        (responseBody.type === 'base64' ? responseBody.mimeType : undefined),
      encodedDataLength: responseEncodedSize,
      content: responseContent
    }
  } else {
    error = toNetworkError(result.error)
  }

  const inferredResourceType =
    options?.resourceType ||
    inferResourceType(pickMimeType(response?.headers || []), url)

  const sizes: NetworkSizes | undefined = mergeSizes(
    {
      requestBodySize,
      responseBodySize: response?.content?.size,
      encodedDataLength: response?.encodedDataLength ?? response?.content?.encodedSize,
      headersSize: estimateHeadersSize(requestHeaders, response?.headers)
    },
    options?.sizes
  )

  const entry: NetworkEntry = {
    id: requestId,
    requestId,
    url,
    method,
    resourceType: inferredResourceType,
    startTime,
    endTime,
    duration,
    request: baseRequest,
    response,
    timing: timing ? toNetworkTiming(timing) : undefined,
    initiator: options?.initiator,
    connection: options?.connection,
    security: options?.security,
    cache: options?.cache,
    redirect: options?.redirect,
    sizes: sizes && hasAnySize(sizes) ? sizes : undefined,
    error,
    meta: options?.meta
  }

  return entry
}

function toNetworkTiming(timing: TimingInfo): NetworkTiming {
  return {
    startTime: timing.startTime,
    endTime: timing.endTime,
    duration: timing.duration
  }
}

function toNetworkError(error: ErrorSpec): NetworkError {
  return {
    type: error.type,
    message: error.message
  }
}

function toHeadersArray(headers?: Record<string, string>): Header[] {
  if (!headers) return []
  return Object.entries(headers).map(([name, value]) => ({
    name,
    value
  }))
}

function pickHeaderValue(headers: Header[], name: string): string | undefined {
  const lower = name.toLowerCase()
  return headers.find((h) => h.name.toLowerCase() === lower)?.value
}

function pickMimeType(headers: Header[] | undefined): string | undefined {
  if (!headers) return undefined
  const value = pickHeaderValue(headers, 'content-type')
  if (!value) return undefined
  return value.split(';')[0]?.trim()
}

function parseContentLength(headers: Header[]): number | undefined {
  const value = pickHeaderValue(headers, 'content-length')
  if (!value) return undefined
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return undefined
  return parsed
}

function parseQueryString(url: string): NameValue[] {
  try {
    const u = new URL(url)
    const pairs: NameValue[] = []
    u.searchParams.forEach((value, name) => {
      pairs.push({ name, value })
    })
    return pairs
  } catch {
    return []
  }
}

function toRequestBody(request: RequestSpec): RequestBody | undefined {
  if (!request.body) return undefined
  if (request.body.type === 'json') {
    return {
      mimeType: 'application/json',
      json: request.body.value
    }
  }
  if (request.body.type === 'text') {
    return {
      mimeType: 'text/plain',
      text: request.body.value
    }
  }
  if (request.body.type === 'form') {
    return {
      mimeType: 'application/x-www-form-urlencoded',
      params: Object.entries(request.body.value).map(([name, value]) => ({
        name,
        value
      }))
    }
  }
  return undefined
}

function serializeRequestBodyText(request: RequestSpec): string | undefined {
  if (!request.body) return undefined
  if (request.body.type === 'json') {
    return safeJSONStringify(request.body.value)
  }
  if (request.body.type === 'text') {
    return String(request.body.value)
  }
  if (request.body.type === 'form') {
    return new URLSearchParams(request.body.value).toString()
  }
  return undefined
}

function inferRequestMimeType(request: RequestSpec): string | undefined {
  if (!request.body) return undefined
  if (request.body.type === 'json') return 'application/json'
  if (request.body.type === 'form') return 'application/x-www-form-urlencoded'
  if (request.body.type === 'text') return 'text/plain'
  return undefined
}

function toResponseContent(
  body: ResponseBody,
  mimeType?: string
): ResponseContent {
  if (body.type === 'json') {
    const text = safeJSONStringify(body.value)
    const size = text ? byteLength(text) : undefined
    return {
      mimeType: mimeType || 'application/json',
      json: body.value,
      text,
      encoding: 'utf-8',
      size,
      encodedSize: size
    }
  }
  if (body.type === 'base64') {
    const base64 = body.value || ''
    const size = base64ToByteLength(base64)
    return {
      mimeType: body.mimeType || mimeType || 'application/octet-stream',
      base64,
      encoding: 'base64',
      size,
      encodedSize: size
    }
  }
  const text = String(body.value ?? '')
  const size = byteLength(text)
  return {
    mimeType: mimeType || 'text/plain',
    text,
    encoding: 'utf-8',
    size,
    encodedSize: size
  }
}

function parseRequestCookies(headers: Header[]): NetworkCookie[] {
  const value = pickHeaderValue(headers, 'cookie')
  if (!value) return []
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((pair) => {
      const [name, ...rest] = pair.split('=')
      return {
        name: name || '',
        value: rest.join('=').trim()
      }
    })
    .filter((c) => c.name)
}

function parseResponseCookies(headers: Header[], setCookies?: string[]): NetworkCookie[] {
  const cookieLines =
    setCookies && setCookies.length
      ? setCookies
      : (() => {
          const value = pickHeaderValue(headers, 'set-cookie')
          return value ? [value] : []
        })()

  if (!cookieLines.length) return []

  const cookies = cookieLines
    .map((line) => parseSetCookie(line))
    .filter((cookie): cookie is NetworkCookie => Boolean(cookie?.name))

  return cookies
}

function parseSetCookie(line: string): NetworkCookie | undefined {
  const parts = line.split(';').map((p) => p.trim())
  if (!parts.length) return undefined

  const [nameValue, ...attrs] = parts
  const [name, ...rest] = nameValue.split('=')
  const cookie: NetworkCookie = {
    name: name || '',
    value: rest.join('=').trim()
  }

  attrs.forEach((attr) => {
    const [k, ...v] = attr.split('=')
    const key = k.toLowerCase()
    const val = v.join('=')
    if (key === 'domain') cookie.domain = val
    if (key === 'path') cookie.path = val
    if (key === 'expires') cookie.expires = Date.parse(val)
    if (key === 'max-age') cookie.expires = Date.now() + Number(val) * 1000
    if (key === 'httponly') cookie.httpOnly = true
    if (key === 'secure') cookie.secure = true
    if (key === 'samesite') {
      const s = val.toLowerCase()
      cookie.sameSite = s === 'strict' ? 'Strict' : s === 'lax' ? 'Lax' : 'None'
    }
  })

  return cookie.name ? cookie : undefined
}

function inferResourceType(mimeType?: string, url?: string): ResourceType {
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) return 'media'
    if (mimeType.startsWith('font/')) return 'font'
    if (mimeType === 'text/html') return 'document'
    if (mimeType === 'text/css') return 'stylesheet'
    if (
      mimeType === 'application/javascript' ||
      mimeType === 'text/javascript' ||
      mimeType === 'application/x-javascript'
    ) return 'script'
    if (
      mimeType === 'application/json' ||
      mimeType === 'text/json' ||
      mimeType === 'application/xml' ||
      mimeType === 'text/xml' ||
      mimeType === 'text/event-stream'
    ) return 'fetch'
  }

  const ext = (url || '').split('?')[0].split('#')[0].split('.').pop()?.toLowerCase()
  if (ext) {
    if (['html', 'htm'].includes(ext)) return 'document'
    if (['css'].includes(ext)) return 'stylesheet'
    if (['js', 'mjs', 'cjs'].includes(ext)) return 'script'
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext)) return 'image'
    if (['mp4', 'webm', 'mp3', 'wav', 'ogg'].includes(ext)) return 'media'
    if (['woff', 'woff2', 'ttf', 'otf'].includes(ext)) return 'font'
    if (['json', 'xml'].includes(ext)) return 'fetch'
  }

  return 'other'
}

function estimateHeadersSize(requestHeaders: Header[], responseHeaders?: Header[]): number | undefined {
  const reqSize = requestHeaders.length ? byteLength(formatHeaders(requestHeaders)) : 0
  const resSize = responseHeaders && responseHeaders.length
    ? byteLength(formatHeaders(responseHeaders))
    : 0
  const total = reqSize + resSize
  return total > 0 ? total : undefined
}

function formatHeaders(headers: Header[]): string {
  return headers.map((h) => `${h.name}: ${h.value}\r\n`).join('')
}

function mergeSizes(base: NetworkSizes, override?: NetworkSizes): NetworkSizes | undefined {
  if (!override) return base
  return {
    ...base,
    ...override
  }
}

function hasAnySize(sizes: NetworkSizes): boolean {
  return Object.values(sizes).some((v) => typeof v === 'number' && !Number.isNaN(v))
}

function safeJSONStringify(value: any): string {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function byteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length
  }
  return text.length
}

function base64ToByteLength(base64: string): number {
  if (!base64) return 0
  const cleaned = base64.replace(/=+$/, '')
  return Math.floor((cleaned.length * 3) / 4)
}
