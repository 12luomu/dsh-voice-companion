// 离线 harness：假 ctx 跑通路由 / llm-stream 句切分 / Edge TTS / ASR
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const tmpSettings = path.join(here, '.tmp-settings.json')
try { fs.unlinkSync(tmpSettings) } catch (e) {}
process.env.VOICE_COMPANION_SETTINGS_FILE = tmpSettings
process.env.VOICE_COMPANION_RECORDS_DIR = path.join(here, '.tmp-records')
try { fs.rmSync(path.join(here, '.tmp-records'), { recursive: true, force: true }) } catch (e) {}

const results = []
function pass(name, extra = '') { results.push(['PASS', name, extra]); console.log('PASS ' + name + (extra ? ' :: ' + extra : '')) }
function fail(name, err) { results.push(['FAIL', name, String(err && err.message || err)]); console.log('FAIL ' + name + ' :: ' + (err && err.stack || err)) }

function makeReq(method, url, body) {
  const listeners = { data: [], end: [], error: [], close: [] }
  const req = {
    method, url,
    headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
    socket: { remoteAddress: '127.0.0.1' },
    on(ev, cb) { (listeners[ev] || (listeners[ev] = [])).push(cb); return req },
    destroy() { for (const cb of listeners.close) { try { cb() } catch (e) {} } }
  }
  setImmediate(() => {
    if (body !== undefined) {
      const buf = Buffer.from(JSON.stringify(body))
      for (const cb of listeners.data) { try { cb(buf) } catch (e) {} }
    }
    for (const cb of listeners.end) { try { cb() } catch (e) {} }
  })
  return req
}

function makeRes() {
  let finish = null
  const done = new Promise((resolve) => { finish = resolve })
  const res = {
    status: 0, headers: null, chunks: [], ended: false, closed: false,
    writeHead(s, h) { res.status = s; res.headers = h },
    write(c) { res.chunks.push(typeof c === 'string' ? Buffer.from(c) : Buffer.from(c)); return true },
    end(c) {
      if (c) res.chunks.push(typeof c === 'string' ? Buffer.from(c) : Buffer.from(c))
      if (!res.ended) { res.ended = true; finish() }
    },
    done,
    destroy() { res.closed = true },
    on() {},
    get text() { return Buffer.concat(res.chunks).toString('utf8') },
    get bytes() { return Buffer.concat(res.chunks) },
    json() { return JSON.parse(res.text) }
  }
  return res
}

const fakeCtx = (() => {
  const handlers = new Map()
  const services = new Map()
  let routeHandler = null
  let effects = []
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name) },
    inject(deps, cb) { if (deps.includes('webServer')) cb(ctx) },
    get(key) { return services.get(key) || null },
    effect(fn) { const d = fn(); if (typeof d === 'function') effects.push(d) },
    webServer: {
      register(reg) { routeHandler = reg.handler; return () => { routeHandler = null } }
    },
    _handlers: handlers,
    _services: services,
    get handler() { return routeHandler },
    _dispose() { for (const d of effects) { try { d() } catch (e) {} } effects = [] }
  }
  return ctx
})()

fakeCtx._services.set('speechToText', {
  snapshot() {
    return {
      providers: [{ id: 'sensevoice', name: 'SenseVoice', preparation: { phase: 'ready' } }],
      selection: { providerId: 'sensevoice', language: 'auto' }
    }
  },
  resolve(req) { return { audio: req.audio, language: req.language } },
  async transcribe(spec) {
    if (!spec || !spec.audio || spec.audio.length < 10) throw new Error('too short')
    return { text: '你好世界', audioSeconds: 1.2, inferenceSeconds: 0.35 }
  },
  async prepare() {}
})

const mod = await import('../index.js')
mod.apply(fakeCtx, {})
assert.ok(typeof fakeCtx.handler === 'function', 'webServer route registered')
pass('route mounted', 'prefix ' + mod.BASE)

const call = async (method, sub, body) => {
  const res = makeRes()
  await fakeCtx.handler(makeReq(method, mod.BASE + sub, body), res)
  await Promise.race([
    res.done,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout: ' + method + ' ' + sub)), 40000))
  ])
  return res
}

try {
  const res = await call('GET', '/state')
  const j = res.json()
  assert.equal(j.ok, true)
  assert.equal(j.enabled, false)
  assert.equal(j.asr.providerId, 'sensevoice')
  assert.equal(j.settings.voice, 'zh-CN-XiaoxiaoNeural')
  pass('/state', 'phase=' + j.phase + ' asr=' + j.asr.phase)
} catch (e) { fail('/state', e) }

try {
  const res = await call('POST', '/settings', { patch: { silenceMs: 1234, rate: '+15%', bogus: 1 } })
  const j = res.json()
  assert.equal(j.silenceMs, 1234)
  assert.equal(j.rate, '+15%')
  assert.equal('bogus' in j, false)
  const back = (await call('GET', '/settings')).json()
  assert.equal(back.silenceMs, 1234)
  assert.ok(fs.existsSync(tmpSettings), 'settings persisted')
  pass('/settings roundtrip', 'rate=' + back.rate)
} catch (e) { fail('/settings roundtrip', e) }

// 自动上下文策略参数必须被接受并持久化
try {
  await call('POST', '/settings', { idleNewSessionMs: 300000, autoCompactTurns: 12, recordsKeepDays: 7 })
  const s = (await call('GET', '/settings')).json()
  const ok = s.idleNewSessionMs === 300000 && s.autoCompactTurns === 12 && s.recordsKeepDays === 7
  if (ok) pass('auto-policy settings', 'idle=' + s.idleNewSessionMs + ' turns=' + s.autoCompactTurns + ' days=' + s.recordsKeepDays)
  else fail('auto-policy settings', new Error('got ' + JSON.stringify({ i: s.idleNewSessionMs, t: s.autoCompactTurns, d: s.recordsKeepDays })))
  await call('POST', '/settings', { idleNewSessionMs: 600000, autoCompactTurns: 20, recordsKeepDays: 30 })
} catch (e) { fail('auto-policy settings', e) }

// SSE 订阅（先连，后面断言事件）
const sse = makeRes()
let sseDetached = false
try {
  await fakeCtx.handler(makeReq('GET', mod.BASE + '/events?tabId=t1'), sse)
  assert.ok(sse.status === 200)
  assert.ok(sse.text.includes('event: hello'))
  pass('/events hello')
} catch (e) { fail('/events hello', e) }

let audioId = null
try {
  const t0 = Date.now()
  const res = await call('POST', '/speak', { text: '你好，这是一次语音合成测试。' })
  const j = res.json()
  assert.equal(j.ok, true, JSON.stringify(j))
  audioId = j.id
  assert.ok(typeof j.url === 'string' && j.url.includes('/audio/'))
  pass('/speak edge-tts', 'id=' + j.id + ' in ' + (Date.now() - t0) + 'ms')
} catch (e) { fail('/speak edge-tts', e) }

try {
  assert.ok(audioId, 'no audio id from /speak')
  const res = await call('GET', '/audio/' + audioId)
  assert.equal(res.status, 200)
  assert.equal(res.headers['content-type'], 'audio/mpeg')
  const bytes = res.bytes
  assert.ok(bytes.length > 5000, 'mp3 too small: ' + bytes.length)
  const isMp3 = (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  assert.ok(isMp3, 'not mp3 header: ' + bytes.slice(0, 4).toString('hex'))
  pass('/audio/:id', bytes.length + ' bytes mp3')
} catch (e) { fail('/audio/:id', e) }

try {
  const j = (await call('GET', '/audio/does-not-exist')).json()
  assert.equal(j.ok, false)
  assert.equal(j.code, 'not-found')
  pass('/audio 404')
} catch (e) { fail('/audio 404', e) }

// 启动通话
try {
  const j = (await call('POST', '/start', { sessionId: 'sess-test', tabId: 't1' })).json()
  assert.equal(j.ok, true)
  assert.equal(j.state.enabled, true)
  assert.equal(j.state.sessionId, 'sess-test')
  assert.equal(j.state.phase, 'listening')
  pass('/start', 'phase=' + j.state.phase)
} catch (e) { fail('/start', e) }

// llm/stream tee：断言句子事件、chunk 透传、turn done
try {
  const tap = fakeCtx._handlers.get('llm/stream')
  assert.ok(typeof tap === 'function', 'llm/stream hook missing')
  const inner = async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: '第一句话。' }
    yield { type: 'text-delta', index: 0, text: '第二个**句子**是这样的！' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const out = []
  const stream = tap({ sessionId: 'sess-test' }, () => inner())
  assert.ok(stream && typeof stream[Symbol.asyncIterator] === 'function', 'tap must return async iterator')
  for await (const chunk of stream) out.push(chunk)
  assert.equal(out.length, 4, 'chunks must pass through unchanged: got ' + out.length)
  assert.equal(out[1].text, '第一句话。')
  await new Promise((r) => setTimeout(r, 4500))
  const text = sse.text
  assert.ok(text.includes('event: delta'), 'missing delta event')
  assert.ok(text.includes('event: sentence'), 'missing sentence event')
  const sentenceUrl = /"url":"([^"]+)"/.exec(text)?.[1]
  assert.ok(sentenceUrl, 'sentence url missing')
  const audioRes = await call('GET', sentenceUrl.replace(mod.BASE, ''))
  assert.equal(audioRes.status, 200)
  assert.ok(audioRes.bytes.length > 3000)
  assert.ok(text.includes('"phase":"done"'), 'missing turn done')
  pass('llm/stream tee', 'chunks=4, sentence audio=' + audioRes.bytes.length + 'B')
} catch (e) { fail('llm/stream tee', e) }

// ASR（有 provider）
try {
  const wav = Buffer.alloc(2048, 1)
  const j = (await call('POST', '/asr', { wavBase64: wav.toString('base64'), language: 'zh' })).json()
  assert.equal(j.ok, true, JSON.stringify(j))
  assert.equal(j.text, '你好世界')
  pass('/asr', 'text=' + j.text + ' aud=' + j.audioSeconds + 's')
} catch (e) { fail('/asr', e) }

// skip / interrupt / stop
try {
  const a = (await call('POST', '/skip', {})).json()
  assert.equal(a.ok, true)
  const b = (await call('POST', '/interrupt', {})).json()
  assert.equal(b.ok, true)
  const c = (await call('POST', '/stop', {})).json()
  assert.equal(c.state.enabled, false)
  assert.equal(c.state.phase, 'idle')
  pass('skip/interrupt/stop')
} catch (e) { fail('skip/interrupt/stop', e) }

// health
try {
  const j = (await call('GET', '/health')).json()
  assert.equal(j.ok, true)
  assert.ok(j.tts && typeof j.tts.lastMs === 'number')
  pass('/health', 'tts.lastMs=' + j.tts.lastMs + ' clients=' + j.clients)
} catch (e) { fail('/health', e) }

// ASR（无 provider）——放最后，因为它会把 asr 视图置为 unavailable
try {
  fakeCtx._services.delete('speechToText')
  const wav = Buffer.alloc(512, 2)
  const j = (await call('POST', '/asr', { wavBase64: wav.toString('base64') })).json()
  assert.equal(j.ok, false)
  assert.equal(j.code, 'asr-unavailable')
  assert.ok(j.message && j.message.length > 0)
  pass('/asr without provider', j.code + ': ' + j.message)
} catch (e) { fail('/asr without provider', e) }

// 安全：跨站 Origin 必须被拒
try {
  const res = makeRes()
  const req = makeReq('POST', mod.BASE + '/start', { sessionId: 'x', tabId: 'y' })
  req.headers.origin = 'http://evil.example.com'
  req.headers.host = '127.0.0.1:53646'
  await fakeCtx.handler(req, res)
  await res.done
  assert.equal(res.status, 403, '跨站 Origin 未被拒绝')
  pass('origin guard', '403 cross-site')
} catch (e) { fail('origin guard', e) }

// 安全：POST 非 JSON content-type 必须被拒（防简单请求 CSRF）
try {
  const res = makeRes()
  const req = makeReq('POST', mod.BASE + '/start', { sessionId: 'x', tabId: 'y' })
  req.headers['content-type'] = 'text/plain'
  await fakeCtx.handler(req, res)
  await res.done
  assert.equal(res.status, 415, '非 JSON content-type 未被拒绝')
  pass('content-type guard', '415 text/plain')
} catch (e) { fail('content-type guard', e) }

// 语音会话必须走 agent 工厂：agent + session 一起发布，客户端才能 prompt
try {
  const agentCreations = []
  const agentDisposals = []
  let storeCreateCalls = 0
  fakeCtx._services.set('agents', {
    async create(options) {
      agentCreations.push(options)
      const id = options && options.sessionId
      return { agent: { id }, async dispose() { agentDisposals.push(id) } }
    }
  })
  fakeCtx._services.set('sessions', {
    create() { storeCreateCalls += 1; throw new Error('store create must not be used when agents exist') },
    get() { return { id: 'live' } }
  })

  // 语音 agent 必须带上 provider/model（否则首次 pre-step 直接报错）
  await call('POST', '/settings', { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' })

  const first = (await call('POST', '/session', { reset: true })).json()
  assert.equal(first.ok, true, JSON.stringify(first))
  assert.ok(/^session-voice-/.test(String(first.voiceSessionId || '')), 'voice id shape: ' + first.voiceSessionId)
  assert.equal(agentCreations.length, 1, 'agents.create 必须被调用一次')
  assert.equal(storeCreateCalls, 0, '有 agents 时不得退回 sessions.create')
  assert.ok(agentCreations[0].meta && typeof agentCreations[0].meta.cwd === 'string', 'meta.cwd 必须是绝对路径')
  const passedOptions = agentCreations[0].agentOptions
  assert.ok(passedOptions && passedOptions.provider && passedOptions.model, 'agentOptions 必须带 provider/model')
  assert.equal(passedOptions.provider, 'deepseek-account')
  assert.equal(passedOptions.model, 'deepseek-flash')

  const second = (await call('POST', '/session', { reset: true })).json()
  assert.ok(second.voiceSessionId && second.voiceSessionId !== first.voiceSessionId, 'reset 必须换新会话')
  assert.equal(agentCreations.length, 2)
  assert.equal(agentDisposals.length, 1, '旧 agent 必须被 dispose')
  pass('voice session via agents.create', 'id=' + second.voiceSessionId)
} catch (e) { fail('voice session via agents.create', e) }

// P2/P3：反向回问 / 情境共享 / 防环
try {
  const asksRes = await call('GET', '/asks')
  assert.equal(asksRes.status, 200, JSON.stringify(asksRes.json()))
  assert.ok(Array.isArray(asksRes.json().items), 'asks.items 必须是数组')
  pass('asks route', 'items=' + asksRes.json().items.length)
} catch (e) { fail('asks route', e) }

try {
  const bad = await call('POST', '/ask/answer', { id: 'nope', text: '随便' })
  const body = bad.json()
  assert.equal(body.ok, false)
  assert.equal(body.code, 'not-found')
  pass('ask answer guard', 'not-found')
} catch (e) { fail('ask answer guard', e) }

try {
  const ctxRes = await call('GET', '/context')
  const body = ctxRes.json()
  assert.equal(body.ok, true)
  assert.ok(body.voice && typeof body.voice.active === 'boolean', 'voice 摘要必须存在')
  pass('context route', 'active=' + body.voice.active)
} catch (e) { fail('context route', e) }

try {
  const echo = await call('POST', '/delegate', { text: '【语音委托 #abc】再来一次' })
  assert.equal(echo.json().code, 'echo')
  pass('delegate echo guard', 'echo')
} catch (e) { fail('delegate echo guard', e) }

// v51：委托取消路由 + 记录改名
try {
  const badCancel = await call('POST', '/delegations/cancel', { id: 'nope' })
  assert.equal(badCancel.status, 400, '未知委托必须 400')
  assert.equal(badCancel.json().code, 'not-found')
  pass('delegate cancel guard', 'not-found')
} catch (e) { fail('delegate cancel guard', e) }

try {
  const renamed = await call('POST', '/records/session-voice-selftest/title', { title: '自检话题' })
  assert.equal(renamed.json().ok, true, JSON.stringify(renamed.json()))
  const re = await call('GET', '/records')
  assert.ok(Array.isArray(re.json().items), 'records items')
  pass('record title rename', 'ok')
} catch (e) { fail('record title rename', e) }

fakeCtx._dispose()
try { fs.unlinkSync(tmpSettings) } catch (e) {}
try { fs.rmSync(path.join(here, '.tmp-records'), { recursive: true, force: true }) } catch (e) {}

const failed = results.filter((r) => r[0] === 'FAIL')
console.log('\n===== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' passed =====')
if (failed.length) {
  for (const f of failed) console.log('FAILED: ' + f[1] + ' :: ' + f[2])
  process.exitCode = 1
}
