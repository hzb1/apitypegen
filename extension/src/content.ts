import {
  ProxyRequestMessage,
  ProxyResponseMessage
} from './shared/types'

window.addEventListener('message', (event) => {
  try {
    if (event.source !== window) return

    const msg = event.data as ProxyRequestMessage

    if (msg?.type === 'PLUGIN_PING') {
      window.postMessage({type: 'PLUGIN_PONG'}, '*')
    }

    if (msg?.type !== 'PROXY_REQUEST') return

    chrome.runtime.sendMessage(msg, (response: ProxyResponseMessage) => {
      if (chrome.runtime.lastError) {
        window.postMessage({
          type: 'PROXY_RESPONSE',
          requestId: msg.requestId,
          result: {
            ok: false,
            error: {
              type: 'NETWORK_ERROR',
              message: chrome.runtime.lastError.message || '浏览器扩展请求失败'
            }
          }
        } satisfies ProxyResponseMessage, '*')
        return
      }

      if (!response) {
        window.postMessage({
          type: 'PROXY_RESPONSE',
          requestId: msg.requestId,
          result: {
            ok: false,
            error: {
              type: 'UNKNOWN',
              message: '浏览器扩展未返回响应'
            }
          }
        } satisfies ProxyResponseMessage, '*')
        return
      }

      window.postMessage(response, '*')
    })
  } catch (error) {
    console.error('处理消息时出错:', error)
  }
})
