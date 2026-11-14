// Edge TTS 合成 + 串行队列 + 音频缓存
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { volumeNumber, settingsFile } from './settings.js'

const DIAG_MAX = 200 * 1024

// 诊断：把合成链路上的底层信息写到 DSH_HOME/voice-companion/tts-diag.log，便于定位宿主环境差异
// 只在出错时调用；超过 200KB 自动截断，避免长期堆积。
function diag(event) {
  try {
    const dir = path.dirname(settingsFile())
    mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'tts-diag.log')
    try { if (statSync(file).size > DIAG_MAX) writeFileSync(file, '') } catch (e) {}
    appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n')
  } catch (e) {}
}

const require = createRequire(import.meta.url)
const { MsEdgeTTS, OUTPUT_FORMAT } = require('../vendor/msedge-tts.cjs')

const CACHE_MAX = 60
const CACHE_TTL = 5 * 60 * 1000
const SYNTH_TIMEOUT = 12000

export function createTts({ settings, onSentence, onError, onState, isMuted }) {
  const cache = new Map()
  const queue = []
  let running = false
  let generation = 0
  let lastError = null
  let lastMs = 0

  function pruneCache() {
    const now = Date.now()
    for (const [id, entry] of cache) {
      if (now - entry.at > CACHE_TTL) cache.delete(id)
    }
    while (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next()
      if (oldest.done) break
      cache.delete(oldest.value)
    }
  }

  function put(buf, text) {
    const id = randomUUID()
    cache.set(id, { buf, at: Date.now(), text })
    pruneCache()
    return id
  }

  function get(id) {
    const entry = cache.get(id)
    if (!entry) return null
    if (Date.now() - entry.at > CACHE_TTL) { cache.delete(id); return null }
    return entry.buf
  }

  function synthesizeOnce(text) {
    return new Promise((resolve, reject) => {
      const cfg = settings.get()
      const started = Date.now()
      let tts = null
      let timer = null
      let settled = false
      const chunks = []
      const finish = (err, buf) => {
        if (settled) return
        settled = true
        if (timer) { clearTimeout(timer); timer = null }
        try { tts?.close?.() } catch (e) {}
        if (err) reject(err)
        else { lastMs = Date.now() - started; resolve(buf) }
      }
      timer = setTimeout(() => finish(new Error('tts-timeout')), SYNTH_TIMEOUT)
      try {
        tts = new MsEdgeTTS()
        Promise.resolve(tts.setMetadata(cfg.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3))
          .then(() => {
            try {
              const ws = tts._ws
              if (ws && typeof ws.on === 'function') {
                ws.on('error', (e) => diag({ stage: 'ws-error', message: String(e?.message || e), code: e?.code }))
                ws.on('close', (code, reason) => diag({ stage: 'ws-close', code, reason: String(reason ?? '') }))
                ws.on('unexpected-response', (req, res) => diag({ stage: 'ws-unexpected', status: res?.statusCode, date: res?.headers?.date }))
              }
            } catch (e) {}
            const { audioStream } = tts.toStream(String(text), {
              rate: cfg.rate, pitch: cfg.pitch, volume: volumeNumber(cfg.volume)
            })
            audioStream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
            audioStream.on('end', () => {
              const buf = Buffer.concat(chunks)
              if (!buf.length) {
                diag({ stage: 'stream-empty', isBrowser: !!tts._isBrowser, wsState: tts._ws?.readyState })
                finish(new Error('tts-empty'))
              } else finish(null, buf)
            })
            audioStream.on('error', (e) => {
              diag({ stage: 'stream-error', message: String(e?.message || e), cause: String(e?.cause?.message || ''), code: e?.cause?.code })
              finish(e || new Error('tts-stream-error'))
            })
          })
          .catch((e) => {
            diag({ stage: 'meta-failed', message: String(e?.message || e), cause: String(e?.cause?.message || ''), code: e?.cause?.code, status: e?.cause?.statusCode })
            finish(e || new Error('tts-metadata-failed'))
          })
      } catch (e) {
        diag({ stage: 'construct-failed', message: String(e?.message || e) })
        finish(e || new Error('tts-construct-failed'))
      }
    })
  }

  async function speak(text) {
    const clean = String(text ?? '').trim()
    if (!clean) throw new Error('tts-empty-text')
    try {
      return await synthesizeOnce(clean)
    } catch (e) {
      return await synthesizeOnce(clean) // 重试一次（新实例）
    }
  }

  function enqueue(item) {
    queue.push({ ...item, gen: generation })
    void pump()
    onState?.()
  }

  async function pump() {
    if (running) return
    running = true
    const gen = generation
    onState?.()
    try {
      while (queue.length) {
        const item = queue.shift()
        if (item.gen !== generation || gen !== generation) continue
        if (typeof isMuted === 'function' && isMuted(item.turn)) continue
        let buf = null
        try {
          buf = await speak(item.text)
        } catch (e) {
          lastError = String(e?.message || e)
          try { onError?.({ code: 'tts-failed', message: lastError, text: item.text }) } catch (e2) {}
          continue
        }
        if (item.gen !== generation || gen !== generation) continue
        if (typeof isMuted === 'function' && isMuted(item.turn)) continue
        let id = null
        try {
          id = put(buf, item.text)
          onSentence?.({
            id,
            text: item.text,
            url: '/voice-companion/audio/' + id,
            index: item.index,
            turn: item.turn
          })
        } catch (e) {
          lastError = String(e?.message || e)
        }
      }
    } finally {
      running = false
      onState?.()
    }
  }

  function skip() {
    generation++
    queue.length = 0
    onState?.()
  }

  return {
    enqueue,
    speak,
    skip,
    get,
    store(buf, text) { return put(buf, text) },
    get queueLength() { return queue.length + (running ? 1 : 0) },
    stats() { return { ready: !lastError || lastMs > 0, lastError, lastMs } }
  }
}
