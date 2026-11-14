// 把 LLM 流式文本切成适合朗读的短句，并清洗 Markdown
const MIN_LEN = 6
const MAX_LEN = 220
const HARD_BUFFER = 140

const TERMINATORS = '。！？!?；;\n'
const TRAILERS = '。！？!?；;”’"\')）】」》…'

function roughLen(text) {
  return String(text).replace(/\s+/g, '').length
}

/** 朗读前清洗：去代码块残留、链接、Markdown 记号、表格、不可朗读符号。 */
export function sanitizeForSpeech(input) {
  let s = String(input ?? '')
  s = s.split('\n').filter((line) => !/^\s*\|/.test(line)).join('\n')
  s = s.replace(/```[\s\S]*?(?:```|$)/g, ' ')
  s = s.replace(/https?:\/\/[^\s)）】]+/g, ' ')
  s = s.replace(/`([^`]*)`/g, '$1')
  s = s.replace(/^\s{0,3}#{1,6}\s*/gm, '')
  s = s.replace(/^\s{0,3}>\s?/gm, '')
  s = s.replace(/[*_~]/g, '')
  s = s.replace(/^\s{0,3}[-+]\s+/gm, '')
  s = s.replace(/^\s{0,3}\d+[.)、]\s+/gm, '')
  s = s.replace(/&/g, ' 和 ')
  s = s.replace(/\|/g, ' ')
  s = s.replace(/[\u200b-\u200f\ufeff]/g, '')
  s = s.replace(/[^\p{Script=Han}\p{L}\p{N}\s，。！？、；：""''（）《》〈〉…—.,!?;:'"()\-%+·]/gu, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/** 超长句按标点再切，避免单句憋太久。 */
export function splitLong(text, max = MAX_LEN) {
  let s = String(text ?? '').trim()
  const out = []
  let guard = 0
  while (s.length > max && guard++ < 40) {
    let cut = -1
    const floor = Math.max(30, max - 120)
    for (let i = Math.min(s.length - 1, max); i >= floor; i--) {
      if ('，,、；;。！？!? '.includes(s[i])) { cut = i + 1; break }
    }
    if (cut <= 0) cut = max
    const piece = s.slice(0, cut).trim()
    if (piece) out.push(piece)
    s = s.slice(cut).trim()
  }
  if (s) out.push(s)
  return out.filter(Boolean)
}

export class SentenceSegmenter {
  constructor() {
    this.buf = ''
    this.tail = ''
    this.inFence = false
  }

  /** 流式喂入，返回本次可朗读的完整句子数组。 */
  feed(text) {
    let s = this.tail + String(text ?? '')
    this.tail = ''
    if (!this.inFence) {
      const m = /`{1,2}$/.exec(s)
      if (m) {
        this.tail = m[0]
        s = s.slice(0, s.length - m[0].length)
      }
    }
    const clean = this._stripFences(s)
    this.buf += clean
    return this._drain()
  }

  /** 收尾：返回剩余文本切出的句子。 */
  flush() {
    let out = []
    if (this.tail) {
      this.buf += this._stripFences(this.tail)
      this.tail = ''
    }
    const rest = this.buf
    this.buf = ''
    const text = sanitizeForSpeech(rest)
    if (text) out = out.concat(splitLong(text))
    this.inFence = false
    return out
  }

  _stripFences(s) {
    let out = ''
    let i = 0
    while (i < s.length) {
      if (s.startsWith('```', i)) {
        this.inFence = !this.inFence
        i += 3
        continue
      }
      if (!this.inFence) out += s[i]
      i++
    }
    return out
  }

  _drain() {
    const out = []
    let guard = 0
    while (guard++ < 100) {
      const cut = this._findCut()
      if (cut <= 0) break
      const raw = this.buf.slice(0, cut)
      this.buf = this.buf.slice(cut)
      const text = sanitizeForSpeech(raw)
      if (!text || roughLen(text) < 2) continue
      for (const piece of splitLong(text)) out.push(piece)
    }
    return out
  }

  _findCut() {
    const b = this.buf
    for (let i = 0; i < b.length; i++) {
      const ch = b[i]
      if (TERMINATORS.includes(ch)) {
        let j = i + 1
        while (j < b.length && TRAILERS.includes(b[j])) j++
        if (roughLen(b.slice(0, j)) >= MIN_LEN) return j
        i = j - 1
      }
    }
    if (roughLen(b) >= HARD_BUFFER) {
      const window = b.slice(0, HARD_BUFFER)
      const comma = Math.max(window.lastIndexOf('，'), window.lastIndexOf(','))
      if (comma >= MIN_LEN) return comma + 1
      return HARD_BUFFER
    }
    return 0
  }
}
