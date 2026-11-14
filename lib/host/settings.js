// 设置：默认值、合并、校验、落盘（DSH_HOME/voice-companion/settings.json）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULTS = Object.freeze({
  enabled: false,
  voice: 'zh-CN-XiaoxiaoNeural',
  rate: '+0%',
  pitch: '+0Hz',
  volume: '+0%',
  autoSend: true,
  silenceMs: 900,
  minSpeechMs: 250,
  maxUtteranceMs: 30000,
  bargeIn: true,
  spokenFormat: true,
  language: 'auto',
  wakeWord: '',
  requireWakeWord: false,
  duckWhileSpeaking: true,
  autoStart: true,
  orbAutoHideMs: 8000,
  chime: true,
  showSubtitles: true,
  sensitivity: 0.5,
  idleNewSessionMs: 600000,
  autoCompactTurns: 20,
  recordsKeepDays: 30,
  provider: '',
  model: '',
  reasoningEffort: ''
})

const LANGUAGES = new Set(['auto', 'zh', 'en'])

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

function percentString(value, fallback, lo, hi) {
  const raw = String(value ?? '').trim()
  const m = /^([+-]?\d+(?:\.\d+)?)\s*%?$/.exec(raw)
  if (!m) return fallback
  const n = clamp(Math.round(Number(m[1])), lo, hi)
  return (n >= 0 ? '+' : '') + n + '%'
}

function hzString(value, fallback) {
  const raw = String(value ?? '').trim()
  const m = /^([+-]?\d+(?:\.\d+)?)\s*Hz$/i.exec(raw)
  if (!m) return fallback
  const n = clamp(Math.round(Number(m[1])), -100, 100)
  return (n >= 0 ? '+' : '') + n + 'Hz'
}

/** 逐字段校验 + 归一化，未知字段丢弃，非法值回落默认。 */
export function normalize(patch, base = DEFAULTS) {
  const out = { ...base }
  if (!patch || typeof patch !== 'object') return out
  const src = patch
  if ('enabled' in src) out.enabled = !!src.enabled
  if ('voice' in src) {
    const v = String(src.voice ?? '').trim()
    out.voice = /^[A-Za-z]{2,3}-[A-Za-z]{2,4}-[A-Za-z0-9]+Neural$/.test(v) ? v : base.voice
  }
  if ('rate' in src) out.rate = percentString(src.rate, base.rate, -50, 100)
  if ('pitch' in src) out.pitch = hzString(src.pitch, base.pitch)
  if ('volume' in src) out.volume = percentString(src.volume, base.volume, -100, 100)
  if ('autoSend' in src) out.autoSend = !!src.autoSend
  if ('silenceMs' in src) out.silenceMs = clamp(Math.round(Number(src.silenceMs) || base.silenceMs), 300, 3000)
  if ('minSpeechMs' in src) out.minSpeechMs = clamp(Math.round(Number(src.minSpeechMs) || base.minSpeechMs), 100, 2000)
  if ('maxUtteranceMs' in src) out.maxUtteranceMs = clamp(Math.round(Number(src.maxUtteranceMs) || base.maxUtteranceMs), 2000, 60000)
  if ('bargeIn' in src) out.bargeIn = !!src.bargeIn
  if ('spokenFormat' in src) out.spokenFormat = !!src.spokenFormat
  if ('language' in src) out.language = LANGUAGES.has(String(src.language)) ? String(src.language) : base.language
  if ('wakeWord' in src) out.wakeWord = String(src.wakeWord ?? '').slice(0, 24).trim()
  if ('requireWakeWord' in src) out.requireWakeWord = !!src.requireWakeWord
  if ('duckWhileSpeaking' in src) out.duckWhileSpeaking = !!src.duckWhileSpeaking
  if ('autoStart' in src) out.autoStart = !!src.autoStart
  if ('chime' in src) out.chime = !!src.chime
  if ('showSubtitles' in src) out.showSubtitles = !!src.showSubtitles
  if ('idleNewSessionMs' in src) {
    const n = Number(src.idleNewSessionMs)
    out.idleNewSessionMs = Number.isFinite(n) ? clamp(Math.round(n), 0, 3600000) : base.idleNewSessionMs
  }
  if ('autoCompactTurns' in src) {
    const n = Number(src.autoCompactTurns)
    out.autoCompactTurns = Number.isFinite(n) ? clamp(Math.round(n), 4, 200) : base.autoCompactTurns
  }
  if ('recordsKeepDays' in src) {
    const n = Number(src.recordsKeepDays)
    out.recordsKeepDays = Number.isFinite(n) ? clamp(Math.round(n), 1, 3650) : base.recordsKeepDays
  }
  if ('sensitivity' in src) {
    const n = Number(src.sensitivity)
    out.sensitivity = Number.isFinite(n) ? Math.min(1, Math.max(0.05, n)) : base.sensitivity
  }

  if ('orbAutoHideMs' in src) {
    const n = Number(src.orbAutoHideMs)
    out.orbAutoHideMs = Number.isFinite(n) ? Math.min(60000, Math.max(0, Math.round(n))) : base.orbAutoHideMs
  }
  if ('provider' in src) out.provider = String(src.provider ?? '').trim().slice(0, 80)
  if ('model' in src) out.model = String(src.model ?? '').trim().slice(0, 120)
  if ('reasoningEffort' in src) out.reasoningEffort = String(src.reasoningEffort ?? '').trim().slice(0, 40)
  if (out.requireWakeWord && !out.wakeWord) out.requireWakeWord = false
  return out
}

/** volume 设置（百分比增减）→ msedge-tts 需要的 0-100 number。 */
export function volumeNumber(volume) {
  const m = /^([+-]?\d+)\s*%$/.exec(String(volume || '+0%'))
  const delta = m ? Number(m[1]) : 0
  return clamp(100 + delta, 0, 100)
}

export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

export function settingsFile() {
  if (process.env.VOICE_COMPANION_SETTINGS_FILE) return process.env.VOICE_COMPANION_SETTINGS_FILE
  return path.join(dshHome(), 'voice-companion', 'settings.json')
}

export function createSettings({ logger } = {}) {
  let current = { ...DEFAULTS }

  function load() {
    try {
      const file = settingsFile()
      const text = fs.readFileSync(file, 'utf8')
      const parsed = JSON.parse(text)
      current = normalize(parsed, DEFAULTS)
    } catch (e) {
      current = { ...DEFAULTS }
    }
    return current
  }

  function save() {
    try {
      const file = settingsFile()
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const tmp = file + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf8')
      fs.renameSync(tmp, file)
      return true
    } catch (e) {
      try { logger?.warn?.('[voice-companion] settings save failed:', e?.message) } catch (e2) {}
      return false
    }
  }

  load()

  return {
    get all() { return current },
    get() { return current },
    replace(patch) {
      current = normalize(patch, current)
      save()
      return current
    },
    merge(patch) {
      current = normalize({ ...current, ...(patch || {}) }, DEFAULTS)
      save()
      return current
    },
    reload() { return load() }
  }
}
