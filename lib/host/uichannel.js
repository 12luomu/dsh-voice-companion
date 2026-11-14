// UI 指令通道：Host 想做「真的把界面切过去」这类动作时，浏览器端才是执行者。
// Host 广播 `ui` 事件 → 客户端执行 → POST /ui-ack 回执；Host 侧 await 结果。
export function createUiChannel({ broadcast, timeoutMs = 8000 }) {
  let seq = 0
  const pending = new Map()

  function request(kind, payload, options = {}) {
    seq += 1
    const id = 'ui-' + Date.now().toString(36) + '-' + seq
    const wait = options.wait !== false
    try {
      if (typeof broadcast === 'function') broadcast('ui', { id, kind, payload: payload || {} })
    } catch (e) {}
    if (!wait) return Promise.resolve({ ok: true, id, queued: true })
    const timeout = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : timeoutMs
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        resolve({ ok: false, code: 'ui-timeout', message: '没有已连接的 DSH 页面响应（请确认页面处于打开状态）' })
      }, timeout)
      timer.unref?.()
      pending.set(id, { resolve, timer })
    })
  }

  function ack(id, result) {
    const item = pending.get(String(id || ''))
    if (!item) return false
    clearTimeout(item.timer)
    pending.delete(String(id))
    item.resolve({ ok: true, id: String(id), result: result === undefined ? null : result })
    return true
  }

  function dispose() {
    for (const [id, item] of pending) {
      clearTimeout(item.timer)
      item.resolve({ ok: false, code: 'ui-cancelled', message: '通道已关闭' })
      pending.delete(id)
    }
  }

  return {
    request,
    ack,
    dispose,
    get size() { return pending.size }
  }
}
