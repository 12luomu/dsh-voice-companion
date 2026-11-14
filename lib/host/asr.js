// 复用 Host 的 speechToText（SenseVoice）做语音转写
export function createAsr(ctx, { onState } = {}) {
  let ready = false
  let providerId = null
  let phase = 'unknown'
  let lastError = null

  function service() {
    try {
      if (typeof ctx.get === 'function') return ctx.get('speechToText') || null
    } catch (e) {}
    try { return ctx.speechToText || null } catch (e) {}
    return null
  }

  function view() {
    return { ready, providerId, phase, error: lastError }
  }

  function applySnapshot(snap) {
    if (!snap || !Array.isArray(snap.providers)) { phase = 'unavailable'; ready = false; return view() }
    const selected = snap.selection?.providerId
    const provider = snap.providers.find((p) => p && p.id === selected) || snap.providers[0] || null
    providerId = provider?.id ?? null
    phase = provider?.preparation?.phase ?? 'unknown'
    ready = phase === 'ready' || phase === 'standby'
    const err = provider?.preparation?.error
    if (err) lastError = String(err?.message ?? err)
    else if (ready) lastError = null
    return view()
  }

  function refresh() {
    const svc = service()
    if (!svc || typeof svc.snapshot !== 'function') {
      phase = 'unavailable'
      ready = false
      providerId = null
      return view()
    }
    try {
      return applySnapshot(svc.snapshot())
    } catch (e) {
      lastError = String(e?.message ?? e)
      return view()
    }
  }

  async function prepare() {
    refresh()
    const svc = service()
    if (!svc || !providerId || typeof svc.prepare !== 'function') return view()
    if (phase === 'ready' || phase === 'standby') return view()
    try {
      await svc.prepare(providerId)
    } catch (e) {
      lastError = String(e?.message ?? e)
    }
    refresh()
    try { onState?.() } catch (e) {}
    return view()
  }

  function mapLanguage(language) {
    const raw = String(language ?? 'auto')
    if (raw === 'zh' || raw === 'en') return raw
    return undefined
  }

  async function transcribe(wavBase64, language) {
    const svc = service()
    if (!svc || typeof svc.resolve !== 'function' || typeof svc.transcribe !== 'function') {
      return { ok: false, code: 'asr-unavailable', message: 'Host 没有可用的 speechToText 服务' }
    }
    refresh()
    if (!providerId) {
      return { ok: false, code: 'asr-unavailable', message: '没有已注册的语音识别 provider' }
    }
    let buffer
    try {
      buffer = Buffer.from(String(wavBase64 || ''), 'base64')
    } catch (e) {
      return { ok: false, code: 'bad-audio', message: 'wavBase64 解码失败' }
    }
    if (!buffer.length) return { ok: false, code: 'bad-audio', message: '音频为空' }
    if (buffer.length > 12 * 1024 * 1024) return { ok: false, code: 'too-large', message: '音频超过 12MB' }
    let spec
    try {
      spec = svc.resolve({ audio: new Uint8Array(buffer), language: mapLanguage(language) })
    } catch (e) {
      return { ok: false, code: 'asr-resolve-failed', message: String(e?.message ?? e) }
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 60000)
      let result
      try {
        result = await svc.transcribe(spec, controller.signal)
      } finally {
        clearTimeout(timer)
      }
      const text = String(result?.text ?? '').trim()
      const audible = text.replace(/[\s\p{P}\p{S}]/gu, '')
      if (!audible) return { ok: false, code: 'no-speech', text: '', message: '没有识别到有效语音' }
      return {
        ok: true,
        text,
        audioSeconds: Number(result?.audioSeconds ?? 0),
        inferenceSeconds: Number(result?.inferenceSeconds ?? 0)
      }
    } catch (e) {
      lastError = String(e?.message ?? e)
      try { onState?.() } catch (e2) {}
      return { ok: false, code: 'asr-failed', message: lastError }
    }
  }

  return { refresh, prepare, transcribe, view }
}
