// 语音记录：独立于 DSH 会话存储（会话日志是分帧 zstd，不适合逐条读写）。
// 每条记录一行 JSON：{ at, role: 'user'|'assistant'|'note', text, turn? }
import fs from 'node:fs'
import path from 'node:path'
import { dshHome } from './settings.js'

const MAX_ENTRY = 20000
const MAX_FILE = 4 * 1024 * 1024
const MAX_ENTRIES = 500
const SAFE_ID = /^[A-Za-z0-9._-]{1,96}$/

export function recordsDir() {
  const dir = process.env.VOICE_COMPANION_RECORDS_DIR || path.join(dshHome(), 'voice-companion', 'records')
  try { fs.mkdirSync(dir, { recursive: true }) } catch (e) {}
  return dir
}

function fileOf(sessionId) {
  const id = String(sessionId || '')
  if (!SAFE_ID.test(id)) return null
  return path.join(recordsDir(), id + '.jsonl')
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const text = String(entry.text ?? '').slice(0, MAX_ENTRY)
  if (!text.trim()) return null
  if (entry.role === 'tool') return null
  const role = entry.role === 'assistant' || entry.role === 'note' ? entry.role : 'user'
  const at = Number(entry.at) || Date.now()
  const out = { at, role, text }
  if (typeof entry.turn === 'number' && Number.isFinite(entry.turn)) out.turn = entry.turn
  if (typeof entry.sessionId === 'string' && entry.sessionId) out.sessionId = entry.sessionId
  return out
}

export function appendRecord(sessionId, entry) {
  const file = fileOf(sessionId)
  const item = normalizeEntry(entry)
  if (!file || !item) return { ok: false, code: 'bad-record', message: 'invalid session id or empty text' }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // 去重：同角色、同文本、4 秒内的重复写入直接忽略（防止一次回复被记两遍）
    try {
      const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
      const lastLine = lines[lines.length - 1]
      if (lastLine) {
        const last = JSON.parse(lastLine)
        if (last && last.role === item.role && last.text === item.text && Math.abs(Number(item.at) - Number(last.at)) < 4000) {
          return { ok: true, at: last.at, deduped: true }
        }
      }
    } catch (e) {}
    fs.appendFileSync(file, JSON.stringify(item) + '\n', 'utf8')
    try {
      const size = fs.statSync(file).size
      if (size > MAX_FILE) compact(file, MAX_ENTRIES)
      trimEntries(file, MAX_ENTRIES)
    } catch (e) {}
    return { ok: true, at: item.at }
  } catch (e) {
    return { ok: false, code: 'append-failed', message: String(e?.message ?? e) }
  }
}

/** 只保留最近 keep 条（默认 500），防止单会话无限增长。 */
function trimEntries(file, keep) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split('\n').filter(Boolean)
    if (lines.length <= keep) return
    fs.writeFileSync(file, lines.slice(lines.length - keep).join('\n') + '\n', 'utf8')
  } catch (e) {}
}

/** 按天清理旧记录文件（默认保留 30 天）。 */
export function pruneOldRecords(options = {}) {
  const keepDays = Number.isFinite(Number(options.keepDays)) ? Number(options.keepDays) : 30
  const cutoff = Date.now() - keepDays * 24 * 3600 * 1000
  const dir = recordsDir()
  let names = []
  try { names = fs.readdirSync(dir) } catch (e) { names = [] }
  const removed = []
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue
    const file = path.join(dir, name)
    try {
      const st = fs.statSync(file)
      if (st.mtimeMs < cutoff) { fs.rmSync(file, { force: true }); removed.push(name) }
    } catch (e) {}
  }
  return { ok: true, keepDays, removed }
}

function compact(file, keep) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split('\n').filter(Boolean)
    const tail = lines.slice(Math.max(0, lines.length - keep))
    fs.writeFileSync(file, tail.join('\n') + '\n', 'utf8')
  } catch (e) {}
}

const SPEECH_ROLES = new Set(['user', 'assistant'])
// 历史版本把工具行记成了 role:'user'（normalizeEntry 把未知角色归一成 user），
// 这里再用文案前缀兜一层，保证「只保留我说的话和助手复读的话」。
const TOOL_MARKS = /^\s*(?:\u{1F6E0}|\u{1F527}|\u2699)/u

function isSpeech(entry) {
  if (!entry || !SPEECH_ROLES.has(String(entry.role || ''))) return false
  return !TOOL_MARKS.test(String(entry.text || ''))
}

function readLines(file) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    const out = []
    for (const line of text.split('\n')) {
      if (!line) continue
      try { out.push(JSON.parse(line)) } catch (e) {}
    }
    return out
  } catch (e) {
    return []
  }
}

export function readRecord(sessionId, options = {}) {
  const file = fileOf(sessionId)
  if (!file) return { ok: false, code: 'bad-request', message: 'invalid session id' }
  const entries = readLines(file).filter(isSpeech)
  const limit = Math.max(1, Math.min(2000, Number(options.limit) || 800))
  const start = options.fromEnd === false ? 0 : Math.max(0, entries.length - limit)
  return {
    ok: true,
    sessionId: String(sessionId),
    total: entries.length,
    truncated: start > 0,
    entries: entries.slice(start)
  }
}

export function titlePathFor(sessionId) {
  if (!SAFE_ID.test(String(sessionId || ''))) return null
  return path.join(recordsDir(), sessionId + '.title.json')
}

export function readTitle(sessionId) {
  const file = titlePathFor(sessionId)
  if (!file) return ''
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    return typeof raw.title === 'string' ? raw.title : ''
  } catch (e) { return '' }
}

export function writeTitle(sessionId, title) {
  const file = titlePathFor(sessionId)
  if (!file) return { ok: false, code: 'bad-request', message: 'invalid session id' }
  const text = String(title || '').trim().slice(0, 40)
  if (!text) return { ok: false, code: 'bad-request', message: 'empty title' }
  try {
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify({ title: text, at: Date.now() }) + '\n')
    fs.renameSync(tmp, file)
    return { ok: true, title: text }
  } catch (e) { return { ok: false, code: 'write-failed', message: String(e && e.message || e) } }
}

function heuristicTitle(entries) {
  const first = entries.find((e) => e && e.role === 'user')
  if (!first) return ''
  let t = String(first.text || '').replace(/^[\s，。,.！!？?、~～：:]+/, '')
  t = t.replace(/^(你好|您好|那个|嗯|啊|哎)[，,。\s]*/g, '')
  t = t.replace(/[\r\n]+/g, ' ').trim()
  if (t.length > 18) t = t.slice(0, 18) + '…'
  return t
}

export function listRecords() {
  const dir = recordsDir()
  let names = []
  try { names = fs.readdirSync(dir) } catch (e) { names = [] }
  const items = []
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue
    const file = path.join(dir, name)
    let stat = null
    try { stat = fs.statSync(file) } catch (e) { continue }
    const entries = readLines(file).filter(isSpeech)
    const first = entries.find((e) => e && e.role === 'user')
    if (!first) continue // 没有任何用户发言 = 空话题，不列出
    const last = entries.length ? entries[entries.length - 1] : null
    items.push({
      sessionId: name.slice(0, -'.jsonl'.length),
      turns: entries.filter((e) => e && e.role === 'user').length,
      entries: entries.length,
      bytes: stat.size,
      startedAt: entries.length ? entries[0].at : stat.birthtimeMs,
      updatedAt: last ? last.at : stat.mtimeMs,
      preview: first ? String(first.text).slice(0, 80) : '',
      title: readTitle(name.slice(0, -'.jsonl'.length)) || heuristicTitle(entries)
    })
  }
  items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  return items
}

export function deleteRecord(sessionId) {
  const file = fileOf(sessionId)
  if (!file) return { ok: false, code: 'bad-request', message: 'invalid session id' }
  try {
    // 不真删：移到 records/trash/ 下，误删还能找回
    if (fs.existsSync(file)) {
      const trash = path.join(recordsDir(), 'trash')
      try { fs.mkdirSync(trash, { recursive: true }) } catch (e) {}
      fs.renameSync(file, path.join(trash, path.basename(file) + '.' + Date.now()))
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, code: 'delete-failed', message: String(e?.message ?? e) }
  }
}

export function clearRecords() {
  const dir = recordsDir()
  let removed = 0
  let names = []
  try { names = fs.readdirSync(dir) } catch (e) { names = [] }
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue
    try { fs.rmSync(path.join(dir, name), { force: true }); removed += 1 } catch (e) {}
  }
  return { ok: true, removed }
}

/** 把历史记录里的非对话条目（工具调用提示等）清掉，只留用户与助手的话。 */
export function sanitizeRecords() {
  const dir = recordsDir()
  let names = []
  try { names = fs.readdirSync(dir) } catch (e) { names = [] }
  let cleaned = 0
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue
    const file = path.join(dir, name)
    try {
      const lines = readLines(file)
      const kept = []
      let changed = false
      for (const entry of lines.filter(isSpeech)) {
        const prev = kept[kept.length - 1]
        // 历史遗留的重复行（同一回复被写两遍，间隔几毫秒）一并清掉
        if (prev && prev.role === entry.role && prev.text === entry.text && Math.abs(Number(entry.at) - Number(prev.at)) < 4000) {
          changed = true
          continue
        }
        kept.push(entry)
      }
      if (!changed && kept.length === lines.length) continue
      fs.writeFileSync(file, kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : ''), 'utf8')
      cleaned += 1
    } catch (e) {}
  }
  return { ok: true, cleaned }
}

export function searchRecords(query, limit = 40) {
  const q = String(query || '').trim().toLowerCase()
  if (q.length < 2) return { ok: true, query: q, items: [] }
  const dir = recordsDir()
  let names = []
  try { names = fs.readdirSync(dir) } catch { names = [] }
  const hits = []
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue
    const sessionId = name.slice(0, -'.jsonl'.length)
    const title = readTitle(sessionId) || ''
    const entries = readLines(path.join(dir, name)).filter(isSpeech)
    for (const e of entries) {
      const text = String(e.text || '')
      if (text.toLowerCase().indexOf(q) >= 0) {
        hits.push({ sessionId, title, role: e.role, at: Number(e.at) || 0, text: text.slice(0, 220) })
        if (hits.length >= limit) return { ok: true, query: q, items: hits }
      }
    }
  }
  return { ok: true, query: q, items: hits }
}

export function exportAll() {
  const items = listRecords()
  const head = [
    '# 语音对话记录（全部话题）',
    '',
    '- 话题数：' + items.length,
    '- 导出时间：' + new Date().toISOString(),
    ''
  ]
  const blocks = []
  for (const it of items) {
    const one = exportRecord(it.sessionId)
    if (!one.ok) continue
    blocks.push('---', '', '## ' + (it.title || it.preview || it.sessionId), '', one.markdown)
  }
  return { ok: true, topics: items.length, markdown: head.concat(blocks).join('\n') }
}

export function exportRecord(sessionId) {
  const file = fileOf(sessionId)
  if (!file) return { ok: false, code: 'bad-request', message: 'invalid session id' }
  const entries = readLines(file).filter(isSpeech)
  const head = [
    '# 语音对话记录',
    '',
    '- 会话：`' + String(sessionId) + '`',
    '- 条目：' + entries.length,
    '- 导出时间：' + new Date().toISOString(),
    ''
  ]
  const body = entries.map((e) => {
    const when = new Date(Number(e.at) || Date.now()).toLocaleString('zh-CN')
    const who = e.role === 'assistant' ? '助手' : e.role === 'note' ? '提示' : '你'
    return '**' + who + '**（' + when + '）：' + String(e.text || '')
  })
  return { ok: true, sessionId: String(sessionId), markdown: head.concat(body).join('\n') }
}
