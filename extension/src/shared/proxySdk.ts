import  {
  ProxyError,
  type ProxyRequestMessage,
  type ProxyResponseMessage,
} from './types'

/* ----------------------------------
 * 工具函数
 * ---------------------------------- */

function genRequestId() {
  return 'req_' + Date.now() + '_' + Math.random().toString(16).slice(2)
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {}

  // 1. 处理 Headers 对象
  if (headers instanceof Headers) {
    const obj: Record<string, string> = {}
    // Headers 是可迭代的，forEach 是最兼容的处理方式
    headers.forEach((value, key) => {
      obj[key] = value
    })
    return obj
  }

  // 2. 处理 [string, string][] 数组
  if (Array.isArray(headers)) {
    // 显式断言为符合 fromEntries 的元组类型
    return Object.fromEntries(headers as [string, string][])
  }

  // 3. 处理 Record<string, string>
  return headers as Record<string, string>
}

/* ----------------------------------
 * 插件可用性检测
 * ---------------------------------- */


let pluginChecking: {
  promise: Promise<boolean>
  cancel: () => void
} | null = null

export function checkPluginEnabled(timeout = 1000): Promise<boolean> {
  // 如果正在检测，直接复用同一次检测
  if (pluginChecking) {
    return pluginChecking.promise
  }

  let finished = false
  let timer: number | null = null

  const promise = new Promise<boolean>((resolve) => {
    function cleanup() {
      if (finished) return
      finished = true

      window.removeEventListener('message', onMessage)

      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }

      pluginChecking = null
    }

    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'PLUGIN_PONG') {
        cleanup()
        resolve(true)
      }
    }

    window.addEventListener('message', onMessage)
    window.postMessage({ type: 'PLUGIN_PING' }, '*')

    timer = window.setTimeout(() => {
      cleanup()
      resolve(false)
    }, timeout)
  })

  pluginChecking = {
    promise,
    cancel() {
      if (!finished) {
        finished = true
        pluginChecking = null
      }
    },
  }

  return promise
}

/* ----------------------------------
 * 插件代理 fetch（RAW）
 * ---------------------------------- */

async function proxyFetchRaw(
  url: string,
  init?: RequestInit & { timeout?: number },
): Promise<{
  status: number
  statusText: string
  headers: Record<string, string>
  bodyText: string
  bodyType: 'json' | 'text'
}> {
  const requestId = genRequestId()
  let timer: number | undefined;
  const signal = init?.signal; // 获取原生 signal
  const timeout = init?.timeout ?? 10000;

  // @ts-ignore
  return new Promise((resolve, reject) => {

    // 处理已经被取消的情况
    if (signal?.aborted) {
      return reject(new DOMException('The user aborted a request.', 'AbortError'));
    }

    // 1. 定义清理函数，防止监听器残留
    const cleanup = () => {
      window.removeEventListener('message', handler);
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    // 监听信号取消
    const onAbort = () => {
      clearTimeout(timer); // 显式清除，防止后续触发超时 reject
      cleanup();
      // 这里可以考虑向插件发送一个“取消请求”的指令，但通常 fetch 的中断由后端 timeout 或信号控制
      reject(new DOMException('The user aborted a request.', 'AbortError'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort);
    }

    // 2. 启动超时计时器
    timer = window.setTimeout(() => {
      cleanup();
      reject(new ProxyError({
        type: 'TIMEOUT',
        message: `Request timed out after ${timeout}ms`
      }));
    }, timeout);


    function handler(e: MessageEvent) {
      const msg = e?.data as ProxyResponseMessage
      if (!msg || msg.type !== 'PROXY_RESPONSE') return
      // debugger;
      if (msg.requestId !== requestId) return

      cleanup(); // 收到响应，立即清理计时器和监听器

      if (typeof msg.result !== 'object' || msg.result === null) {
        console.log('插件 fetch 失败:', msg)
        return
      }

      if (!msg.result.ok) {
        const errorSpec = msg.result.error;

        // 打印日志方便调试
        console.error(`[Proxy Fetch Error] Type: ${errorSpec.type}, Message: ${errorSpec.message}`);

        // 如果插件返回的是 TIMEOUT，我们转换为 AbortError 以对齐原生 fetch
        if (msg.result?.error?.type === 'TIMEOUT') {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        } else {
          reject(new ProxyError(errorSpec));
        }

        return
      }

      const res = msg.result.response
      resolve({
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
        bodyText: res.body.type === 'json' ? JSON.stringify(res.body.value) : res.body.value,
        bodyType: res.body.type,
      })
    }

    window.addEventListener('message', handler)

    const message: ProxyRequestMessage = {
      type: 'PROXY_REQUEST',
      requestId,
      payload: {
        url,
        method: (init?.method || 'GET'),
        headers: normalizeHeaders(init?.headers),
        body: init?.body ? { type: 'text', value: String(init.body) } : undefined,
        timeout: init?.timeout // 传递给插件执行
      },
    }

    window.postMessage(message, '*')
  })
}

/* ----------------------------------
 * Response-like 封装
 * ---------------------------------- */

type ProxyResponseRaw = {
  status: number
  statusText: string
  headers: Record<string, string>
  bodyText: string
  bodyType: 'json' | 'text'
}

class ProxyResponse {
  private _bodyUsed = false

  private raw:  ProxyResponseRaw

  constructor(raw: ProxyResponseRaw ) {
    this.raw = raw;
  }

  get ok() {
    return this.raw.status >= 200 && this.raw.status < 300
  }

  get status() {
    return this.raw.status
  }

  get statusText() {
    return this.raw.statusText
  }

  get headers() {
    return new Headers(this.raw.headers)
  }

  get bodyUsed() {
    return this._bodyUsed
  }

  async text(): Promise<string> {
    this._bodyUsed = true
    return this.raw.bodyText
  }

  async json() {
    if (this._bodyUsed) throw new TypeError('Failed to execute "json" on "Response": body stream is locked');
    this._bodyUsed = true;

    if (this.raw.bodyType !== 'json') {
      throw new Error('Response is not JSON')
    }
    // console.warn(this.raw.bodyText)
    return JSON.parse(this.raw.bodyText)
  }

  clone() {
    return new ProxyResponse(this.raw);
  }
}

/* ----------------------------------
 * 最终统一 API：proxyFetch ≈ fetch
 * ---------------------------------- */

export async function proxyFetch(
  input: RequestInfo,
  init?: RequestInit & { timeout?: number },
): Promise<Response | ProxyResponse> {
  const url = typeof input === 'string' ? input : input.url

  const usePlugin = await checkPluginEnabled()

  if (!usePlugin) {
    console.warn('usePlugin', usePlugin)
    console.warn('proxyFetch', input, init)
    // 原生 fetch
    return fetch(input, init)
  }

  console.warn('proxyFetch', url, init)

  try {
    const raw = await proxyFetchRaw(url, init);
    return new ProxyResponse(raw);
  } catch (err) {
    // 如果是超时或其他错误，可以在这里统一记录日志
    if (err instanceof ProxyError) {
      console.warn(`[Bridge] Request to ${url} timed out.`);
    }
    throw err; // 继续抛出给业务层处理
  }
}
