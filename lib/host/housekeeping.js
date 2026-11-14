// 清理：每次新建语音会话，DSH 都会在 DSH_HOME/sessions/<scope>/session-voice-* 下落一份日志。
// 长期使用会慢慢堆积，这里在启动时把「超过 maxAge 且当前宿主没有引用」的语音会话目录删掉。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const VOICE_PREFIX = 'session-voice-'
const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000

export function sessionsRoot() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'sessions')
}

export function pruneVoiceSessionDirs({ keep = [], maxAgeMs = DEFAULT_MAX_AGE, root } = {}) {
  const base = root || sessionsRoot()
  const result = { scanned: 0, removed: [], kept: 0, failed: [] }
  let scopes = []
  try {
    scopes = fs.readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  } catch (e) {
    return result
  }
  const keepSet = new Set((keep || []).map((id) => String(id)))
  const now = Date.now()
  for (const scope of scopes) {
    const dir = path.join(base, scope.name)
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(VOICE_PREFIX)) continue
      result.scanned += 1
      if (keepSet.has(entry.name)) {
        result.kept += 1
        continue
      }
      const full = path.join(dir, entry.name)
      let age = 0
      try {
        age = now - fs.statSync(full).mtimeMs
      } catch (e) {
        continue
      }
      if (age < maxAgeMs) {
        result.kept += 1
        continue
      }
      try {
        fs.rmSync(full, { recursive: true, force: true })
        result.removed.push(entry.name)
      } catch (e) {
        result.failed.push(entry.name)
      }
    }
  }
  return result
}
