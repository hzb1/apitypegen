import {
  ProxyRequestMessage,
  ProxyResponseMessage,
  ProxySuccess,
  ProxyFailure
} from './shared/types'

const PROXY_REQUEST_ID_HEADER = 'x-proxy-request-id'
const CLEANUP_TTL_MS = 60_000

const chromeRequestToProxyId = new Map<string, string>()
const proxyIdToChromeRequestId = new Map<string, string>()
const proxyIdToSetCookies = new Map<string, string[]>()
const cleanupTimers = new Map<string, number>()

registerWebRequestTracking()

chrome.runtime.onMessage.addListener(
  (msg: ProxyRequestMessage, _sender, sendResponse) => {
    if (msg.type !== 'PROXY_REQUEST') return

    handleRequest(msg)
      .then(sendResponse)
      .catch(sendResponse)

    return true
  }
)

async function handleRequest(
  msg: ProxyRequestMessage
): Promise<ProxyResponseMessage> {
  console.warn(`收到请求:`, msg)
  const { requestId, payload } = msg
  const startTime = Date.now()

  try {
    new URL(payload.url)

    const controller = new AbortController()
    if (payload.timeout) {
      setTimeout(() => controller.abort(), payload.timeout)
    }

    const headers = withProxyRequestId(payload.headers, requestId)

    const res = await fetch(payload.url, {
      method: payload.method,
      headers,
      body: buildBody(payload.body),
      signal: controller.signal
    })
    const body = await readResponseBody(res)
    const endTime = Date.now()
    const setCookies = consumeSetCookies(requestId)

    const success: ProxySuccess = {
      ok: true,
      response: {
        url: res.url,
        status: res.status,
        statusText: res.statusText,
        headers: headersToObject(res.headers),
        setCookies,
        body: body as any
      },
      timing: {
        startTime,
        endTime,
        duration: endTime - startTime
      }
    }

    console.log(`[${requestId}] 成功响应`, {
      type: 'PROXY_RESPONSE',
      requestId,
      result: success
    })
    return {
      type: 'PROXY_RESPONSE',
      requestId,
      result: success
    }
  } catch (err: any) {
    consumeSetCookies(requestId)
    const failure: ProxyFailure = {
      ok: false,
      error: {
        type:
          err.name === 'AbortError'
            ? 'TIMEOUT'
            : err instanceof TypeError
              ? 'NETWORK_ERROR'
              : 'UNKNOWN',
        message: err.message || 'Unknown error'
      }
    }
    console.error(`[${requestId}] 失败响应`, err, err.name, err.message)
    console.log(`[${requestId}] 失败响应`, {
      type: 'PROXY_RESPONSE',
      requestId,
      result: failure
    })

    return {
      type: 'PROXY_RESPONSE',
      requestId,
      result: failure
    }
  }
}

function buildBody(body?: any): BodyInit | undefined {
  if (!body) return undefined
  if (body.type === 'json') return JSON.stringify(body.value)
  if (body.type === 'text') return body.value
  if (body.type === 'form')
    return new URLSearchParams(body.value).toString()
}

function headersToObject(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {}
  headers.forEach((v, k) => (obj[k] = v))
  return obj
}

function parseBody(text: string) {
  try {
    return { type: 'json', value: JSON.parse(text) }
  } catch {
    return { type: 'text', value: text }
  }
}

async function readResponseBody(res: Response) {
  const contentType = res.headers.get('content-type') || ''
  if (isImageContentType(contentType)) {
    const buffer = await res.arrayBuffer()
    return {
      type: 'base64',
      value: arrayBufferToBase64(buffer),
      mimeType: contentType
    }
  }
  const text = await res.text()
  return parseBody(text)
}

function isImageContentType(contentType: string) {
  return contentType.toLowerCase().startsWith('image/')
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function registerWebRequestTracking() {
  if (!chrome.webRequest?.onBeforeSendHeaders) return

  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      const header = details.requestHeaders?.find(
        (h) => h.name.toLowerCase() === PROXY_REQUEST_ID_HEADER
      )
      if (!header?.value) return

      chromeRequestToProxyId.set(details.requestId, header.value)
      proxyIdToChromeRequestId.set(header.value, details.requestId)
      scheduleCleanup(header.value)
    },
    { urls: ['<all_urls>'] },
    ['requestHeaders', 'extraHeaders']
  )

  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      const proxyId = chromeRequestToProxyId.get(details.requestId)
      if (!proxyId) return

      const setCookies = (details.responseHeaders || [])
        .filter((h) => h.name.toLowerCase() === 'set-cookie')
        .map((h) => h.value)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)

      if (setCookies.length) {
        proxyIdToSetCookies.set(proxyId, setCookies)
      }

      chromeRequestToProxyId.delete(details.requestId)
      scheduleCleanup(proxyId)
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders', 'extraHeaders']
  )
}

function scheduleCleanup(proxyId: string) {
  const existing = cleanupTimers.get(proxyId)
  if (existing) {
    clearTimeout(existing)
  }
  const timer = setTimeout(() => {
    cleanupProxyId(proxyId)
  }, CLEANUP_TTL_MS)
  cleanupTimers.set(proxyId, timer as unknown as number)
}

function cleanupProxyId(proxyId: string) {
  const chromeId = proxyIdToChromeRequestId.get(proxyId)
  if (chromeId) {
    chromeRequestToProxyId.delete(chromeId)
  }
  proxyIdToChromeRequestId.delete(proxyId)
  proxyIdToSetCookies.delete(proxyId)
  const timer = cleanupTimers.get(proxyId)
  if (timer) {
    clearTimeout(timer)
  }
  cleanupTimers.delete(proxyId)
}

function consumeSetCookies(proxyId: string): string[] | undefined {
  const cookies = proxyIdToSetCookies.get(proxyId)
  cleanupProxyId(proxyId)
  return cookies && cookies.length ? cookies : undefined
}

function withProxyRequestId(
  headers: Record<string, string> | undefined,
  requestId: string
): Record<string, string> {
  const next = { ...(headers || {}) }
  const hasHeader = Object.keys(next).some(
    (key) => key.toLowerCase() === PROXY_REQUEST_ID_HEADER
  )
  if (!hasHeader) {
    next[PROXY_REQUEST_ID_HEADER] = requestId
  }
  return next
}
