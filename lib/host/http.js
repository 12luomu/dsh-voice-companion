// 极简 HTTP 工具：loopback 限制、JSON 读写、SSE
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1'])

export function isLoopback(req) {
  const addr = req?.socket?.remoteAddress || ''
  return LOOPBACK.has(addr) || addr === '::ffff:127.0.0.1'
}

export function denyNonLoopback(req, res) {
  if (isLoopback(req)) return false
  sendJson(res, 403, { ok: false, code: 'forbidden', message: 'only loopback requests are allowed' })
  return true
}

/**
 * 防 CSRF：浏览器发起的跨站请求一律拒绝。
 * - `sec-fetch-site: cross-site` 直接拒（现代浏览器都会带）。
 * - 带 Origin 时必须与 Host 同源；`Origin: null` 也拒。
 * 这样即使有恶意本地页面，也无法用简单请求驱动 /start /asr 之类的副作用接口。
 */
export function denyCrossSite(req, res) {
  const h = req?.headers || {}
  const site = String(h['sec-fetch-site'] || '')
  if (site === 'cross-site') {
    sendJson(res, 403, { ok: false, code: 'cross-site', message: 'cross-site requests are not allowed' })
    return true
  }
  const origin = h.origin
  if (origin) {
    let host = ''
    try { host = new URL(String(origin)).host } catch (e) { host = '' }
    if (!host || host !== String(h.host || '')) {
      sendJson(res, 403, { ok: false, code: 'bad-origin', message: 'origin mismatch' })
      return true
    }
  }
  return false
}

export function sendJson(res, status, payload) {
  try {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body)
    })
    res.end(body)
  } catch (e) {
    try { res.destroy() } catch (e2) {}
  }
}

export function readJson(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    const done = (value) => resolve(value)
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        done(null)
        try { req.destroy() } catch (e) {}
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return done({})
      try {
        const parsed = JSON.parse(raw)
        done(parsed && typeof parsed === 'object' ? parsed : {})
      } catch (e) {
        done(null)
      }
    })
    req.on('error', () => done(null))
  })
}

export function sendBytes(res, status, contentType, buffer) {
  try {
    res.writeHead(status, {
      'content-type': contentType,
      'cache-control': 'no-store',
      'content-length': buffer.length
    })
    res.end(buffer)
  } catch (e) {
    try { res.destroy() } catch (e2) {}
  }
}
