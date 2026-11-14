// SSE 订阅中心：多客户端广播 + 状态节流 + 心跳
export function createHub({ getState }) {
  const clients = new Set()
  let heartbeat = null
  let stateTimer = null
  let statePending = false

  function write(res, name, data) {
    try {
      res.write('event: ' + name + '\n' + 'data: ' + JSON.stringify(data ?? null) + '\n\n')
      return true
    } catch (e) {
      return false
    }
  }

  function ensureHeartbeat() {
    if (heartbeat) return
    heartbeat = setInterval(() => {
      for (const res of clients) {
        try { res.write(': ping\n\n') } catch (e) { clients.delete(res) }
      }
      if (!clients.size) stopHeartbeat()
    }, 15000)
    if (typeof heartbeat.unref === 'function') heartbeat.unref()
  }

  function stopHeartbeat() {
    if (!heartbeat) return
    clearInterval(heartbeat)
    heartbeat = null
  }

  const byKey = new Map()

  function attach(res, key) {
    if (key) {
      const prev = byKey.get(key)
      if (prev && prev !== res) {
        try { write(prev, 'closed', { reason: 'superseded' }) } catch (e) {}
        try { prev.end() } catch (e) {}
        clients.delete(prev)
      }
      byKey.set(key, res)
    }
    clients.add(res)
    ensureHeartbeat()
    return function detach() {
      clients.delete(res)
      if (key && byKey.get(key) === res) byKey.delete(key)
      if (!clients.size) stopHeartbeat()
    }
  }

  function broadcast(name, data) {
    for (const res of Array.from(clients)) {
      if (!write(res, name, data)) clients.delete(res)
    }
  }

  function broadcastState() {
    if (stateTimer) { statePending = true; return }
    flushState()
    stateTimer = setTimeout(() => {
      stateTimer = null
      if (statePending) { statePending = false; broadcastState() }
    }, 100)
    if (typeof stateTimer.unref === 'function') stateTimer.unref()
  }

  function flushState() {
    let payload = null
    try { payload = getState() } catch (e) { payload = null }
    if (payload) broadcast('state', payload)
  }

  function close() {
    stopHeartbeat()
    if (stateTimer) { clearTimeout(stateTimer); stateTimer = null }
    for (const res of clients) {
      try { res.end() } catch (e) {}
    }
    clients.clear()
    byKey.clear()
  }

  return { attach, write, broadcast, broadcastState, close, get size() { return clients.size } }
}
