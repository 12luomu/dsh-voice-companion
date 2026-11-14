// dsh-voice-companion · Host 半：Edge TTS + SenseVoice ASR + LLM 流逐句朗读
import fs from 'node:fs'
import path from 'node:path'
import { createSettings, dshHome } from './lib/host/settings.js'
import { SentenceSegmenter } from './lib/host/segmenter.js'
import { createTts } from './lib/host/tts.js'
import { createAsr } from './lib/host/asr.js'
import { createHub } from './lib/host/hub.js'
import { appendDebug, readDebug } from './lib/host/debuglog.js'
import { pruneVoiceSessionDirs } from './lib/host/housekeeping.js'
import { denyCrossSite, denyNonLoopback, readJson, sendBytes, sendJson } from './lib/host/http.js'
import { appendRecord, clearRecords, deleteRecord, exportAll, exportRecord, searchRecords, listRecords, pruneOldRecords, readRecord, readTitle, sanitizeRecords, writeTitle } from './lib/host/records.js'
import { createUiChannel } from './lib/host/uichannel.js'
import { createRelay } from './lib/host/relay.js'
import { registerTools } from './lib/host/tools.js'

export const name = 'dsh-voice-companion'
export const BASE = '/voice-companion'
const CLIENT_BUILD = 'v62'

const VOICES_URL =
  'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list' +
  '?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4'

const FALLBACK_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', gender: '女', locale: 'zh-CN' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊', gender: '女', locale: 'zh-CN' },
  { id: 'zh-CN-YunxiNeural', name: '云希', gender: '男', locale: 'zh-CN' },
  { id: 'zh-CN-YunjianNeural', name: '云健', gender: '男', locale: 'zh-CN' },
  { id: 'zh-CN-YunxiaNeural', name: '云夏', gender: '男', locale: 'zh-CN' },
  { id: 'zh-CN-YunyangNeural', name: '云扬', gender: '男', locale: 'zh-CN' },
  { id: 'zh-CN-liaoning-XiaobeiNeural', name: '晓北', gender: '女', locale: 'zh-CN' },
  { id: 'zh-CN-shaanxi-XiaoniNeural', name: '晓妮', gender: '女', locale: 'zh-CN' },
  { id: 'zh-TW-HsiaoChenNeural', name: '曉臻', gender: '女', locale: 'zh-TW' },
  { id: 'zh-TW-YunJheNeural', name: '雲哲', gender: '男', locale: 'zh-TW' },
  { id: 'zh-TW-HsiaoYuNeural', name: '曉雨', gender: '女', locale: 'zh-TW' },
  { id: 'zh-HK-HiuGaaiNeural', name: '曉佳', gender: '女', locale: 'zh-HK' },
  { id: 'zh-HK-HiuMaanNeural', name: '曉曼', gender: '女', locale: 'zh-HK' },
  { id: 'zh-HK-WanLungNeural', name: '雲龍', gender: '男', locale: 'zh-HK' }
]

const SPOKEN_PROMPT = [
  '当前正在进行实时语音通话（voice-companion）：你的回复会被立刻转成语音朗读。',
  '你同时是这台 DSH 的语音管家，可以真正操作界面：',
  'voice_conversations_list / voice_conversation_read / voice_conversation_open 查/读/打开对话；',
  'voice_panel_open 切界面（chat、sidebar、plugins、schedules、mnemon、mcp-connector、video、novel、settings 等）；',
  'voice_workspaces 列工作区并可切换；voice_settings 读改语音设置；voice_records_list 看历史语音记录。',
  '要启停插件就用 plugin_manager 工具（先说明会重载界面，等用户同意）。',
  '要别的对话替你干活（查资料、读文件、跑命令、改代码）用 voice_tell，把任务说清楚；对方回合结束时系统会自动把结论念给你听，你不用轮询。',
  '需要用户拍板时用 voice_ask 提问（比如要不要继续、选哪个方案），用户口头回答会自动带回来；默认等 60 秒，超时就按默认继续。',
  '想确认用户前台在看哪个对话用 voice_context；危险操作（退出 DSH、删除语音记录、归档对话）必须先 voice_ask 确认一次再执行。',
  '表达要求：(1) 用 1–4 句口语化中文，先给结论；',
  '(2) 不要使用 Markdown、列表、表格、代码块、链接或表情符号；',
  '(3) 数字、符号、缩写用可朗读的完整说法；',
  '(4) 不要复述用户的整句原话；需要长篇内容时先给一句话结论，再问是否需要展开。',
  '安全要求：(5) 会给别人看到或不可逆的动作（往别的对话发消息、启停插件、退出 DSH），必须先说清后果，等用户明确同意后再做；',
  '(6) 只有用户明确说「发给当前对话」或同义句时，才调用 voice_send_to_conversation。'
].join('\n')

function safeLogger(ctx) {
  try { return ctx?.logger || null } catch (e) { return null }
}

export function apply(ctx, config = {}) {
  const logger = safeLogger(ctx)
  const settings = createSettings({ logger })

  const state = {
    enabled: false,
    sessionId: null,
    voiceSessionId: null,
    chatSessionId: null,
    activeTabId: null,
    phase: 'idle',
    turnSeq: 0,
    currentTurn: 0,
    mutedTurn: -1,
    lastError: null,
    sentenceSeq: 0,
    turns: 0,
    recap: ''
  }

  let asrView = { ready: false, providerId: null, phase: 'unknown', error: null }
  let voicesCache = null
  let voicesAt = 0
  let deltaBuf = ''
  let deltaTimer = null

  const hub = createHub({ getState: () => statePayload() })
  const ui = createUiChannel({ broadcast: (name, data) => hub.broadcast(name, data), timeoutMs: 8000 })

  // 委托回执：主对话跑完一段被委托的任务后，把结论念给用户听（不打断、不刷屏）
  function speakNotice(text) {
    try {
      const clean = String(text ?? '').trim()
      if (!clean) return
      if (!state.enabled || !state.sessionId) {
        hub.broadcast('note', { text: clean })
        return
      }
      state.sentenceSeq += 1
      tts.enqueue({ text: clean, sessionId: state.sessionId, turn: -1, index: state.sentenceSeq })
    } catch (e) {
      state.lastError = String(e?.message ?? e)
    }
  }

  // 反向回问：主对话需要用户拍板时，把问题念出来并等口头回答（超时/拒绝都不挂死）
  const asks = new Map()
  const smokeResults = new Map()
  let askSeq = 0

  function askUser(options) {
    const opts = options && typeof options === 'object' ? options : {}
    const question = String(opts.question || '').trim()
    if (!question) return Promise.resolve({ ok: false, code: 'bad-request', message: '缺少要问的问题' })
    if (!state.enabled || !state.sessionId) return Promise.resolve({ ok: false, code: 'voice-idle', message: '语音助手当前不在通话中' })
    const ms = Math.max(5000, Math.min(180000, Number(opts.timeoutMs) || 60000))
    const id = 'ask' + (++askSeq).toString(36) + Math.floor(Math.random() * 900 + 100)
    const sessionId = String(opts.sessionId || '') || state.chatSessionId || ''
    const labels = Array.isArray(opts.options) ? opts.options.slice(0, 6).map((x) => String(x)) : []
    appendDebug({ tag: 'ask-open', data: { id, sessionId, ms } })
    return new Promise((resolve) => {
      const item = { id, sessionId, question, options: labels, createdAt: Date.now() }
      item.finish = (result) => {
        if (!asks.has(id)) return
        asks.delete(id)
        try { clearTimeout(item.timer) } catch (e) {}
        hub.broadcast('ask', { id, status: result.ok ? 'answered' : 'closed', answer: result.answer || '', code: result.code || null })
        appendDebug({ tag: 'ask-close', data: { id, ok: !!result.ok, code: result.code || null } })
        resolve(result)
      }
      item.timer = setTimeout(() => item.finish({ ok: false, code: 'timeout', message: '用户没有在时限内回答，按默认继续' }), ms)
      if (item.timer && typeof item.timer.unref === 'function') item.timer.unref()
      asks.set(id, item)
      hub.broadcast('ask', { id, sessionId, question, options: labels, timeoutMs: ms })
      speakNotice(question)
    })
  }

  function answerAsk(id, text) {
    const key = String(id || '')
    const item = asks.get(key)
    if (!item) return { ok: false, code: 'not-found', message: '这条问题已经过期或不存在' }
    const answer = String(text || '').trim()
    if (!answer) return { ok: false, code: 'empty', message: '没有识别到回答内容' }
    if (answer.indexOf('【语音委托 #') >= 0 || answer.indexOf('【语音回问 #') >= 0) {
      return { ok: false, code: 'echo', message: '回答里带着标记，可能是回声，已忽略' }
    }
    item.finish({ ok: true, answer })
    return { ok: true, id: key, answer }
  }

  // 情境共享：只给摘要，不塞全文
  function contextPayload() {
    const out = {
      ok: true,
      voice: {
        active: !!state.enabled,
        phase: state.phase,
        voiceSessionId: state.voiceSessionId,
        pendingDelegations: relay.list().filter((x) => x.status === 'pending' || x.status === 'running').length
      },
      focused: null
    }
    const sid = state.chatSessionId || ''
    if (!sid) return out
    let title = ''
    try { title = readTitle(sid) || '' } catch (e) {}
    let cwd = ''
    let events = 0
    try {
      const s = sessionsService()?.get(sid)
      if (s) {
        cwd = String(s.header?.cwd || '')
        if (!title) title = String(s.header?.title || '')
        events = (s.snapshotEvents(0) || []).length
      }
    } catch (e) {}
    let running = null
    try {
      const a = agentsService()?.get(sid)
      if (a) running = typeof a.running === 'boolean' ? a.running : null
    } catch (e) {}
    const recent = []
    try {
      const entries = readRecord(sid, { limit: 6, fromEnd: true }).entries || []
      for (const e of entries.slice(-3)) recent.push((e.role === 'user' ? '用户：' : '助手：') + String(e.text || '').slice(0, 90))
    } catch (e) {}
    out.focused = { sessionId: sid, title: title || '', cwd, events, running, recent }
    return out
  }

  function contextLine() {
    try {
      if (!state.enabled || !state.chatSessionId) return ''
      const c = contextPayload().focused
      if (!c) return ''
      let line = '【当前情境】用户前台打开的是《' + (c.title || '未命名对话') + '》(' + c.sessionId + ')'
      if (c.cwd) line += '，工作目录 ' + c.cwd
      if (c.running === true) line += '，正在运行'
      else if (c.running === false) line += '，空闲'
      line += '。'
      if (c.recent && c.recent.length) line += '最近：' + c.recent.join(' / ')
      return line.slice(0, 400)
    } catch (e) { return '' }
  }

  const relay = createRelay({
    historyFile: path.join(dshHome(), 'voice-companion', 'delegations.json'),
    historyMax: 60,
    onComplete: (result) => {
      try {
        const first = (result.items && result.items[0]) || {}
        appendDebug({ tag: 'delegate-done', data: { id: first.id, sessionId: first.sessionId, ok: result.ok, chars: String(result.digest || '').length } })
        hub.broadcast('delegate', { id: first.id, sessionId: first.sessionId, ok: result.ok, digest: result.digest })
        if (!result.ok) {
          // 失败自动重试一次（同一条委托，最多一次），避免偶发中断让用户重说
          if (first.text && Number(first.retries || 0) < 1) {
            void retryDelegateOnce(first)
            return
          }
          speakNotice('委托 ' + first.id + ' 没有跑完，可能被中断了。')
          return
        }
        const digest = String(result.digest || '').trim() || '已经处理完了。'
        speakNotice('委托 ' + first.id + ' 完成了：' + digest)
      } catch (e) {
        state.lastError = String(e?.message ?? e)
      }
    }
  })

  async function retryDelegateOnce(item) {
    try {
      appendDebug({ tag: 'delegate-retry', data: { id: item.id, sessionId: item.sessionId } })
      const r = await delegate(item.sessionId, item.text, { retries: Number(item.retries || 0) + 1, retryOf: item.id })
      hub.broadcast('delegate', { id: item.id, ok: false, retryId: (r && r.id) || '', digest: '自动重试一次' })
      if (!r || r.ok === false) speakNotice('委托 ' + item.id + ' 自动重试也没成功。')
    } catch (e) { /* 重试失败不影响主流程 */ }
  }

  // 委托：把一段任务交给某个对话执行；完成时 relay 回调会把结论念出来
  async function delegate(sessionId, text, opts) {
    const sid = String(sessionId || '') || state.chatSessionId || ''
    const body = String(text || '').trim()
    if (!body) return { ok: false, code: 'bad-request', message: '缺少要委托的内容' }
    if (body.indexOf('【语音委托 #') >= 0) return { ok: false, code: 'echo', message: '这条内容本身就是委托，不能再转交' }
    if (!sid) return { ok: false, code: 'no-session', message: '没有可用的目标对话' }
    let queued = false
    try {
      const ag = agentsService() && agentsService().get ? agentsService().get(sid) : null
      queued = !!(ag && ag.running)
    } catch (e) { queued = false }
    const opt = opts && typeof opts === 'object' ? opts : {}
    const item = relay.create({ sessionId: sid, text: body, queued, retries: Number(opt.retries || 0), retryOf: String(opt.retryOf || '') })
    const message =
      '【语音委托 #' + item.id + '】' + body +
      '\n\n（这条消息来自语音助手，用户在语音里交办。请在这个对话里直接处理；处理完用 2~3 句中文总结结果与关键数字，会念给用户听。）'
    const resp = await ui.request('session.send', { sessionId: sid, text: message }, { wait: true, timeoutMs: 12000 })
    if (!resp || resp.ok === false) {
      relay.cancel(item.id)
      return { ok: false, code: (resp && resp.code) || 'send-failed', message: (resp && resp.message) || '没能把消息投递到目标对话' }
    }
    return { ok: true, id: item.id, sessionId: sid, queued: !!item.queued, status: queued ? 'queued' : 'dispatched', note: queued ? '目标对话正在忙，排到它当前任务之后执行' : '已经交给对话处理，完成后会自动念结果' }
  }

  const tts = createTts({
    settings,
    isMuted: (turn) => turn !== undefined && state.mutedTurn >= 0 && turn === state.mutedTurn,
    onSentence: (evt) => {
      if (state.phase !== 'speaking') setPhase('speaking')
      hub.broadcast('sentence', evt)
      hub.broadcastState()
    },
    onError: (err) => {
      state.lastError = String(err?.message ?? err)
      hub.broadcast('error', { code: err?.code || 'tts-failed', message: state.lastError })
    },
    onState: () => hub.broadcastState()
  })

  const asr = createAsr(ctx, { onState: () => hub.broadcastState() })

  function refreshAsr() {
    try { asr.refresh(); asrView = asr.view() } catch (e) { asrView = { ready: false, providerId: null, phase: 'unavailable', error: String(e?.message ?? e) } }
    return asrView
  }

  // ---- dedicated (hidden) voice session -------------------------------------
  // The voice conversation lives in its own host-side session so it never
  // consumes the user's main chat context. Created lazily, reused while live.
  function sessionsService() {
    try {
      const direct = ctx.sessions
      if (direct && typeof direct.create === 'function') return direct
    } catch (e) {}
    try {
      const viaGet = ctx.get('sessions')
      if (viaGet && typeof viaGet.create === 'function') return viaGet
    } catch (e) {}
    return null
  }

  function liveSession(svc, id) {
    if (!svc || !id) return null
    try { return svc.get(id) || null } catch (e) { return null }
  }

  function agentsService() {
    try {
      const direct = ctx.agents
      if (direct && typeof direct.create === 'function') return direct
    } catch (e) {}
    try {
      const viaGet = ctx.get('agents')
      if (viaGet && typeof viaGet.create === 'function') return viaGet
    } catch (e) {}
    return null
  }

  let voiceHandle = null

  async function releaseVoiceAgent() {
    const handle = voiceHandle
    voiceHandle = null
    if (handle && typeof handle.dispose === 'function') {
      try { await handle.dispose() } catch (e) {
        appendDebug({ tag: 'voice-agent-dispose-failed', data: { message: String(e?.message ?? e) } })
      }
    }
  }

  function mintVoiceId() {
    return 'session-voice-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  }

  function cwdOf() {
    try { return process.cwd() } catch (e) { return null }
  }

  // 用户拍板的方案 A：语音会话跑在固定的中立工作区里，永不因切换对话而重建。
  // 这样它不会污染任何工作区，也不受「当前对话在哪个目录」摆布；
  // 需要动某个工作区的文件时，通过工具打开/委托对应会话，而不是换自己的 cwd。
  function voiceSpaceDir() {
    const dir = process.env.VOICE_COMPANION_SPACE_DIR || path.join(dshHome(), 'voice-companion', 'space')
    try { fs.mkdirSync(dir, { recursive: true }) } catch (e) {}
    return dir
  }

  // A fresh agent has no provider/model of its own; the session it runs needs a
  // recorded selection. Mirror whichever route the attached chat session uses,
  // then remember it so a cold start (no chat session yet) still works.
  function selectionOfAgent(sessionId) {
    try {
      const agents = agentsService()
      const agent = agents && sessionId && typeof agents.get === 'function' ? agents.get(sessionId) : null
      if (!agent) return null
      try {
        const current = agent.model?.current?.()
        if (current && current.provider && current.model) {
          return { provider: current.provider, model: current.model, reasoningEffort: current.reasoningEffort }
        }
      } catch (e) {}
      const options = agent.options
      if (options && options.provider && options.model) {
        return { provider: options.provider, model: options.model, reasoningEffort: options.reasoningEffort }
      }
    } catch (e) {}
    return null
  }

  function selectionOfEvents(sessionId) {
    try {
      const svc = sessionsService()
      const session = svc && sessionId ? svc.get(sessionId) : null
      if (!session || typeof session.snapshotEvents !== 'function') return null
      const events = session.snapshotEvents(0) || []
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const entry = events[i]
        if (entry && entry.type === 'model/selection') {
          const data = entry.data || {}
          if (data.provider && data.model) {
            return { provider: data.provider, model: data.model, reasoningEffort: data.reasoningEffort }
          }
        }
      }
    } catch (e) {}
    return null
  }

  // 全局默认模型选择：用户没指定、聊天会话也拿不到时，用它。
  function defaultSelection() {
    try {
      let svc = null
      try { svc = ctx.agentDefaultModel } catch (e) {}
      if (!svc) { try { svc = ctx.get('agentDefaultModel') } catch (e) {} }
      const sel = svc && typeof svc.currentSelection === 'function' ? svc.currentSelection() : null
      if (sel && sel.provider && sel.model) {
        try { settings.merge({ provider: sel.provider, model: sel.model, reasoningEffort: sel.reasoningEffort || '' }) } catch (e) {}
        return { provider: sel.provider, model: sel.model, reasoningEffort: sel.reasoningEffort || undefined }
      }
    } catch (e) {}
    return null
  }

  function resolveAgentOptions(chatSessionId) {
    const resolved = selectionOfAgent(chatSessionId) || selectionOfEvents(chatSessionId)
    if (resolved) {
      const cfg = settings.get()
      if (cfg.provider !== resolved.provider || cfg.model !== resolved.model || cfg.reasoningEffort !== (resolved.reasoningEffort || '')) {
        try { settings.merge({ provider: resolved.provider, model: resolved.model, reasoningEffort: resolved.reasoningEffort || '' }) } catch (e) {}
      }
      return resolved
    }
    const cfg = settings.get()
    if (cfg.provider && cfg.model) {
      return { provider: cfg.provider, model: cfg.model, reasoningEffort: cfg.reasoningEffort || undefined }
    }
    return defaultSelection()
  }

  // A bare SessionStore session cannot accept prompts — nothing owns its turn
  // loop. The agent factory publishes a session TOGETHER with a live agent, so
  // the client can retain/prompt it like any other conversation. Preferred
  // path; the plain store session stays as a last-resort fallback.
  async function ensureVoiceSession(fallbackId) {
    const targetChat = state.chatSessionId || fallbackId || null
    const current = state.voiceSessionId
    if (current && voiceHandle && liveSession(sessionsService(), current)) return current

    const cwd = voiceSpaceDir()
    const agents = agentsService()
    const agentOptions = resolveAgentOptions(targetChat)
    if (agents && agentOptions) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const id = mintVoiceId()
        try {
          const handle = await agents.create({
            sessionId: id,
            meta: cwd ? { cwd } : undefined,
            agentOptions: agentOptions || undefined
          })
          await releaseVoiceAgent()
          voiceHandle = handle
          state.voiceSessionId = String(handle?.agent?.id ?? id)
          appendDebug({ tag: 'voice-session', data: { id: state.voiceSessionId, via: 'agent', cwd, model: agentOptions ? agentOptions.provider + '/' + agentOptions.model : null } })
          return state.voiceSessionId
        } catch (e) {
          appendDebug({ tag: 'voice-session-agent-failed', data: { message: String(e?.message ?? e) } })
        }
      }
    }

    const svc = sessionsService()
    if (!svc) return fallbackId || null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = mintVoiceId()
      try {
        const created = svc.create(id, cwd ? { meta: { cwd } } : undefined)
        const resolved = (created && created.id) || id
        state.voiceSessionId = String(resolved)
        appendDebug({ tag: 'voice-session', data: { id: state.voiceSessionId, via: 'store', reused: false } })
        return state.voiceSessionId
      } catch (e) {
        appendDebug({ tag: 'voice-session-failed', data: { message: String(e?.message ?? e) } })
      }
    }
    state.voiceSessionId = null
    return fallbackId || null
  }

  /** 把当前语音会话压成一段摘要（用户原话 + 助手复读），作为下一次通话的「长期记忆」。 */
  function buildRecap(maxChars = 700) {
    let entries = []
    try {
      const r = readRecord(state.sessionId, { limit: 24, fromEnd: true })
      if (r && r.ok && Array.isArray(r.entries)) entries = r.entries
    } catch (e) {}
    const lines = []
    for (const e of entries) {
      const role = e?.role
      if (role !== 'user' && role !== 'assistant') continue
      const text = String(e.text ?? '').replace(/\s+/g, ' ').trim()
      if (!text) continue
      lines.push((role === 'user' ? '用户说：' : '你答：') + text)
    }
    let recap = lines.join('\n')
    if (recap.length > maxChars) recap = recap.slice(recap.length - maxChars)
    return recap
  }

  /** 轮换语音会话：先写摘要，再释放旧 agent 并新建（上下文从零开始，但记得上文要点）。 */
  /* ---- 长期记忆：每次自动/手动换话题时，把这段对话的一句话摘要存下来，
       新话题的系统提示里带上最近几条，跨话题也不至于「昨天的事全忘了」 ---- */
  function memoryFile() { return path.join(dshHome(), 'voice-companion', 'memory.jsonl') }
  function loadMemory() {
    try {
      const raw = fs.readFileSync(memoryFile(), 'utf8')
      const out = []
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try { const it = JSON.parse(line); if (it && it.text) out.push(it) } catch (e) {}
      }
      return out.slice(-40)
    } catch (e) { return [] }
  }
  function appendMemory(topicId, text) {
    const body = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240)
    if (!body) return
    try {
      fs.mkdirSync(path.dirname(memoryFile()), { recursive: true })
      const title = topicId ? (readTitle(topicId) || '') : ''
      fs.appendFileSync(memoryFile(), JSON.stringify({ at: Date.now(), topic: topicId || '', title, text: body }) + '\n')
      // 只留最近 40 条
      const all = loadMemory()
      if (all.length > 40) {
        const tmp = memoryFile() + '.tmp'
        fs.writeFileSync(tmp, all.slice(-40).map((x) => JSON.stringify(x)).join('\n') + '\n')
        fs.renameSync(tmp, memoryFile())
      }
    } catch (e) { appendDebug({ tag: 'memory-append-failed', data: { message: String(e?.message ?? e) } }) }
  }
  function memoryLine() {
    const all = loadMemory()
    if (!all.length) return ''
    const picks = all.slice(-3)
    const parts = picks.map((it) => (it.title ? it.title + '：' : '') + String(it.text).slice(0, 90))
    return '【更早话题的要点（供你参考，不要主动复述）】' + parts.join('；')
  }

  async function rotateVoiceSession(reason = 'auto') {
    const prev = state.sessionId
    const recap = buildRecap()
    try {
      state.recap = recap
      state.sessionId = null
      state.voiceSessionId = null
      state.turns = 0
      state.currentTurn = 0
      state.mutedTurn = -1
      await releaseVoiceAgent()
      const nextId = await ensureVoiceSession(state.chatSessionId)
      if (!nextId) {
        state.sessionId = prev
        state.voiceSessionId = prev
        return { ok: false, code: 'rotate-failed' }
      }
      if (recap) {
        // 不再往新话题写「摘要」条目：空话题不该出现在历史里，摘要只走 state.recap；
        // 但把要点写进长期记忆文件，跨话题可参考
        appendMemory(prev, recap)
      }
      hub.broadcastState(statePayload())
      hub.broadcast('note', { text: '已开启新话题，上文要点已保留' })
      appendDebug({ tag: 'voice-session-rotate', data: { reason, prev, next: nextId, recapChars: recap.length } })
      if (prev) void generateTitle(prev)
      return { ok: true, sessionId: nextId }
    } catch (e) {
      appendDebug({ tag: 'voice-session-rotate-failed', data: { reason, message: String(e?.message ?? e) } })
      return { ok: false, code: 'rotate-failed' }
    }
  }

  function statePayload() {
    const cfg = settings.get()
    return {
      ok: true,
      enabled: state.enabled,
      sessionId: state.sessionId,
      voiceSessionId: state.voiceSessionId,
      chatSessionId: state.chatSessionId,
      activeTabId: state.activeTabId,
      phase: state.phase,
      turns: state.turns,
      speaking: state.phase === 'speaking' || tts.queueLength > 0,
      queue: tts.queueLength,
      asr: asrView,
      tts: { ready: true, voice: cfg.voice, lastError: tts.stats().lastError },
      settings: cfg
    }
  }

  function setPhase(phase) {
    if (state.phase === phase) return
    state.phase = phase
    hub.broadcast('turn', { phase, turn: state.currentTurn })
    hub.broadcastState()
  }

  // A turn belongs to the call when it runs in the dedicated voice session or
  // in the chat session the panel is attached to (that fallback happens when
  // the gateway cannot open the hidden session).
  function isVoiceRelevant(sessionId) {
    return !!(sessionId && state.sessionId && sessionId === state.sessionId)
  }

  function pushDelta(text, turn) {
    deltaBuf += text
    if (deltaTimer) return
    deltaTimer = setTimeout(() => {
      deltaTimer = null
      const chunk = deltaBuf
      deltaBuf = ''
      if (chunk) hub.broadcast('delta', { text: chunk, turn })
    }, 80)
    if (typeof deltaTimer.unref === 'function') deltaTimer.unref()
  }

  function enqueueSentence(sessionId, text, turn) {
    // 只朗读语音会话自己的回复；主对话、子代理的回复一律不朗读。
    if (!state.sessionId || sessionId !== state.sessionId) return
    if (state.mutedTurn >= 0 && turn === state.mutedTurn) return
    const clean = String(text ?? '').trim()
    if (!clean) return
    state.sentenceSeq += 1
    tts.enqueue({ text: clean, sessionId, turn, index: state.sentenceSeq })
  }

  async function* tapStream(sessionId, inner, opts) {
    opts = opts || {}
    const voice = opts.voice !== false
    const relayTap = !!opts.relay
    let turn = 0
    if (voice) {
      state.turnSeq += 1
      turn = state.turnSeq
      state.currentTurn = turn
    }
    const segmenter = new SentenceSegmenter()
    let finishReason = null
    try {
      for await (const chunk of inner) {
        try {
          if (chunk && chunk.type === 'text-delta' && chunk.text) {
            if (relayTap) relay.capture(sessionId, chunk.text)
            if (voice) {
              if (state.phase !== 'thinking' && state.phase !== 'speaking') setPhase('thinking')
              pushDelta(chunk.text, turn)
              for (const sentence of segmenter.feed(chunk.text)) enqueueSentence(sessionId, sentence, turn)
            }
          } else if (chunk && chunk.type === 'tool-call-delta' && chunk.name) {
            if (voice) hub.broadcast('tool', { name: chunk.name })
          } else if (chunk && chunk.type === 'finish') {
            finishReason = chunk.reason ?? null
            if (relayTap) {
              try {
                relay.finish(sessionId, { ok: finishReason?.kind !== 'aborted' })
              } catch (e) {
                state.lastError = String(e?.message ?? e)
              }
            }
          }
        } catch (e) {
          state.lastError = String(e?.message ?? e)
        }
        yield chunk
      }
    } finally {
      try {
        const aborted = finishReason?.kind === 'aborted'
        if (relayTap && !finishReason) {
          try {
            relay.finish(sessionId, { ok: !aborted })
          } catch (e) {
            state.lastError = String(e?.message ?? e)
          }
        }
        if (voice) {
          if (!aborted) {
            for (const sentence of segmenter.flush()) enqueueSentence(sessionId, sentence, turn)
          }
          hub.broadcast('turn', { phase: 'done', turn })
          try {
            if (sessionId && sessionId === state.sessionId) {
              state.turns += 1
              const limit = Number(settings.get().autoCompactTurns) || 20
              if (limit > 0 && state.turns >= limit) {
                setTimeout(() => { void rotateVoiceSession('turns') }, 800)?.unref?.()
              }
            }
          } catch (e) {}
          if (state.mutedTurn === turn) state.mutedTurn = -1
          if (state.enabled) setPhase(tts.queueLength > 0 ? 'speaking' : 'listening')
          else setPhase('idle')
        }
      } catch (e) {
        state.lastError = String(e?.message ?? e)
      }
    }
  }

  // ---- LLM 流拦截（核心）----
  try {
    ctx.on('llm/stream', (options, next) => {
      try {
        const sid = options?.sessionId
        const purpose = options?.purpose
        if (!sid || purpose !== undefined) return next()
        const voice = !!(state.enabled && sid === state.sessionId)
        const relayTap = relay.isPending(sid)
        if (!voice && !relayTap) return next()
        if (relayTap) relay.begin(sid)
        return tapStream(sid, next(), { voice, relay: relayTap })
      } catch (e) {
        return next()
      }
    })
  } catch (e) {
    logger?.warn?.('[voice-companion] llm/stream hook failed:', e?.message)
  }

  // ---- 朗读友好系统提示 ----
  try {
    ctx.on('system-prompt/assemble', (assembly, context, next) => {
      try {
        if (!state.enabled || !settings.get().spokenFormat) return next()
        const agentId = context?.agent?.id ?? context?.agent?.sessionId ?? context?.sessionId
        if (agentId && agentId !== state.sessionId) return next()
        if (assembly && Array.isArray(assembly.sections)) {
          assembly.sections.push({ name: 'voice-companion-spoken', text: SPOKEN_PROMPT })
          if (state.recap) {
            assembly.sections.push({
              name: 'voice-companion-recap',
              text: '【上一段语音对话的摘要，仅作背景，不要逐条复述】\n' + state.recap
            })
          }
          const mem = memoryLine()
          if (mem) assembly.sections.push({ name: 'voice-companion-memory', text: mem })
          const ctxLine = contextLine()
          if (ctxLine) assembly.sections.push({ name: 'voice-companion-context', text: ctxLine })
        }
      } catch (e) {}
      return next()
    })
  } catch (e) {
    logger?.warn?.('[voice-companion] system-prompt hook failed:', e?.message)
  }

  // ---- 回合结束 ----
  for (const evt of ['agent/turn-stopping', 'agent/error']) {
    try {
      ctx.on(evt, (payload) => {
        try {
          if (!state.enabled) return
          const id = payload?.agent?.id ?? payload?.agent?.sessionId
          if (id && id !== state.sessionId) return
          if (evt === 'agent/error') {
            state.lastError = String(payload?.error?.message ?? payload?.error ?? 'agent-error')
            hub.broadcast('error', { code: 'agent-error', message: state.lastError })
          }
          hub.broadcastState()
        } catch (e) {}
      })
    } catch (e) {}
  }

  // ---- voices ----
  async function loadVoices(force) {
    const now = Date.now()
    if (!force && voicesCache && now - voicesAt < 60 * 60 * 1000) return voicesCache
    try {
      const res = await fetch(VOICES_URL, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) throw new Error('voices-http-' + res.status)
      const list = await res.json()
      const voices = (Array.isArray(list) ? list : []).map((v) => ({
        id: String(v?.ShortName ?? ''),
        name: String(v?.LocalName ?? v?.ShortName ?? ''),
        gender: String(v?.Gender ?? ''),
        locale: String(v?.Locale ?? ''),
        friendlyName: String(v?.FriendlyName ?? '')
      })).filter((v) => v.id)
      if (!voices.length) throw new Error('voices-empty')
      voicesCache = voices
      voicesAt = now
      return voices
    } catch (e) {
      if (voicesCache) return voicesCache
      return FALLBACK_VOICES.map((v) => ({ ...v, friendlyName: v.name }))
    }
  }

  // ---- 路由 ----
  const titlePending = new Set()

  function selectionForTitle() {
    let sel = null
    try { sel = resolveAgentOptions(state.chatSessionId) } catch (e) {
      appendDebug({ tag: 'title-selection-error', data: { message: String(e && e.message || e).slice(0, 200) } })
      sel = null
    }
    if (sel && sel.provider && sel.model) return sel
    const cfg = settings.get()
    if (cfg.provider && cfg.model) return { provider: cfg.provider, model: cfg.model, reasoningEffort: cfg.reasoningEffort }
    return null
  }

  var titleChain = Promise.resolve()

  function generateTitle(sessionId, opts) {
    var regenerate = !!(opts && opts.regenerate)
    titleChain = titleChain.then(function () { return runGenerateTitle(sessionId, regenerate) }).catch(function (err) { appendDebug({ tag: 'title-threw', data: { sessionId, message: String(err && err.message || err).slice(0, 300), stack: String(err && err.stack || '').slice(0, 600) } }); return null })
    return titleChain
  }

  async function runGenerateTitle(sessionId, regenerate) {
    if (!sessionId) return null
    // 话题标题只固定一次：已存在就直接返回，除非显式要求重命名
    if (!regenerate) {
      const fixed = readTitle(sessionId)
      if (fixed) return fixed
    }
    let sel = null
    try { sel = selectionForTitle() } catch (e) { appendDebug({ tag: 'title-selection-error', data: { message: String(e && e.message || e).slice(0, 200) } }) }
    if (!sel) { appendDebug({ tag: 'record-title-skipped', data: { sessionId, why: 'no-selection' } }); return null }
    let llm = null
    try { llm = ctx.get ? ctx.get('llm') : null } catch (e) { llm = null }
    if (!llm || typeof llm.stream !== 'function') { appendDebug({ tag: 'record-title-skipped', data: { sessionId, why: 'no-llm' } }); return null }
    const rec = readRecord(sessionId, { limit: 800, fromEnd: false })
    const entries = (rec && rec.entries ? rec.entries : []).filter((e) => e && (e.role === 'user' || e.role === 'assistant'))
    if (entries.length < 2) { appendDebug({ tag: 'record-title-skipped', data: { sessionId, why: 'too-few', n: entries.length } }); return null }
    titlePending.add(sessionId)
    try {
      const lines = entries.slice(0, 4).map((e) => (e.role === 'user' ? '用户：' : '助手：') + String(e.text || '').slice(0, 160)).join('\n')
      const prompt = '下面是这段对话的开头。请据此用不超过 10 个汉字给这个话题起一个固定的标题，只输出标题本身，不要引号、标点或解释。\n\n' + lines
      let out = ''
      let reason = ''
      const stream = llm.stream({
        provider: sel.provider,
        model: sel.model,
        maxTokens: 256,
        temperature: 0.3,
        system: '你是话题命名器，只输出简短中文标题。',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        signal: AbortSignal.timeout(9000)
      })
      const kinds = Object.create(null)
      let chunkCount = 0
      for await (const ch of stream) {
        chunkCount += 1
        const kind = ch && ch.type ? String(ch.type) : 'none'
        kinds[kind] = (kinds[kind] || 0) + 1
        if (ch && ch.type === 'text-delta' && ch.text) out += ch.text
        if (ch && ch.type === 'reasoning-delta' && ch.text) reason += ch.text
      }
      if (!out.trim() && reason.trim()) {
        const lastLine = reason.split(/[\n。！？]/).map((x) => x.trim()).filter((x) => x.length >= 2)
        out = lastLine.length ? lastLine[lastLine.length - 1] : ''
      }
      appendDebug({ tag: 'title-raw', data: { sessionId, chunkCount, kinds, chars: out.length, head: out.slice(0, 80) } })
      const title = out.replace(/[\s"'“”‘’《》【】\[\]()（）:：,，.。!！?？]/g, '').slice(0, 14)
      if (!title) return null
      writeTitle(sessionId, title)
      appendDebug({ tag: 'record-title', data: { sessionId, title, via: 'llm' } })
      if (sessionId === state.voiceSessionId && hub) hub.broadcastState(statePayload())
      return title
    } catch (e) {
      appendDebug({ tag: 'record-title-failed', data: { sessionId, message: String(e && e.message || e).slice(0, 160) } })
      return null
    } finally {
      titlePending.delete(sessionId)
    }
  }

  async function handle(req, res) {
    if (denyNonLoopback(req, res)) return
    if (denyCrossSite(req, res)) return
    let url = null
    try { url = new URL(req.url || '/', 'http://127.0.0.1') } catch (e) { url = null }
    const pathname = url?.pathname || '/'
    const sub = pathname.startsWith(BASE) ? (pathname.slice(BASE.length) || '/') : null
    const method = String(req.method || 'GET').toUpperCase()

    if (sub === null) return sendJson(res, 404, { ok: false, code: 'not-found', message: 'unknown route' })

    // 副作用接口只接受 JSON：跨站发 JSON 会触发 CORS 预检，从而被浏览器拦下。
    if (method === 'POST') {
      const ct = String(req.headers?.['content-type'] || '')
      if (!ct.includes('application/json')) {
        return sendJson(res, 415, { ok: false, code: 'unsupported-media-type', message: 'content-type must be application/json' })
      }
    }

    try {
      if (sub === '/state' && method === 'GET') {
        refreshAsr()
        return sendJson(res, 200, statePayload())
      }

      if (sub === '/build' && method === 'GET') {
        sendJson(res, 200, { ok: true, build: CLIENT_BUILD })
        return
      }
      if (sub === '/health' && method === 'GET') {
        refreshAsr()
        return sendJson(res, 200, {
          ok: true,
          tts: tts.stats(),
          asr: asrView,
          lastError: state.lastError,
          clients: hub.size
        })
      }

      if (sub === '/events' && method === 'GET') {
        const tabId = url?.searchParams?.get('tabId') || ''
        try {
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
            'x-accel-buffering': 'no'
          })
        } catch (e) {
          return
        }
        const detach = hub.attach(res, tabId || undefined)
        hub.write(res, 'hello', { tabId, state: statePayload() })
        req.on('close', () => { try { detach() } catch (e) {} })
        return
      }

      if (sub === '/debug') {
        if (method === 'GET') {
          return sendJson(res, 200, { ok: true, lines: readDebug(120) })
        }
        const body = await readJson(req, 256 * 1024)
        if (!body) return sendJson(res, 200, { ok: false, code: 'bad-request', message: 'invalid json' })
        appendDebug({ tag: String(body.tag || ''), data: body.data === undefined ? null : body.data })
        return sendJson(res, 200, { ok: true })
      }

      if (sub === '/ui-ack' && method === 'POST') {
        const body = await readJson(req)
        if (!body) return sendJson(res, 200, { ok: false, code: 'bad-request', message: 'invalid json' })
        const accepted = ui.ack(String(body.id || ''), body.result)
        return sendJson(res, 200, { ok: accepted })
      }

      if (sub === '/records/search' && method === 'GET') {
        const q = new URL(req.url || '/', 'http://local').searchParams.get('q') || ''
        return sendJson(res, 200, searchRecords(q, 40))
      }

      if (sub === '/records/export' && method === 'GET') {
        return sendJson(res, 200, exportAll())
      }

      if (sub === '/records' && method === 'GET') {
        return sendJson(res, 200, { ok: true, items: listRecords() })
      }

      if (sub === '/records' && method === 'POST') {
        const body = await readJson(req, 256 * 1024)
        if (!body) return sendJson(res, 200, { ok: false, code: 'bad-request', message: 'invalid json' })
        const sessionId = String(body.sessionId || '')
        if (!sessionId) return sendJson(res, 200, { ok: false, code: 'bad-request', message: 'sessionId required' })
        const entry = body.entry && typeof body.entry === 'object' ? body.entry : body
        const result = appendRecord(sessionId, entry)
        const role = entry && entry.role === 'assistant' ? 'assistant' : (entry && entry.role === 'user' ? 'user' : 'other')
        if (role === 'assistant') void generateTitle(sessionId)
        return sendJson(res, 200, result)
      }

      if (sub.startsWith('/records/') && sub.endsWith('/title') && method === 'POST') {
        const id = sub.slice('/records/'.length, -'/title'.length)
        const body = await readJson(req, 4096)
        if (!body) return sendJson(res, 200, { ok: false, code: 'bad-request', message: 'invalid json' })
        if (body.auto || body.regenerate) {
          const generated = await generateTitle(id, { regenerate: !!body.regenerate })
          return sendJson(res, 200, generated ? { ok: true, title: generated } : { ok: false, code: 'title-unavailable' })
        }
        return sendJson(res, 200, writeTitle(id, body.title))
      }

      if (sub === '/records/clear' && method === 'POST') {
        return sendJson(res, 200, clearRecords())
      }

      if (sub.startsWith('/records/') && method === 'GET') {
        const rest = sub.slice('/records/'.length)
        const exportMode = rest.endsWith('/export')
        const id = exportMode ? rest.slice(0, -'/export'.length) : rest
        if (exportMode) {
          const result = exportRecord(id)
          return sendJson(res, 200, result)
        }
        const limit = Number(url?.searchParams?.get('limit') || 0)
        return sendJson(res, 200, readRecord(id, limit ? { limit } : {}))
      }

      if (sub.startsWith('/records/') && method === 'POST') {
        const rest = sub.slice('/records/'.length)
        if (rest.endsWith('/delete')) {
          const id = rest.slice(0, -'/delete'.length)
          return sendJson(res, 200, deleteRecord(id))
        }
        return sendJson(res, 404, { ok: false, code: 'not-found', message: 'unknown route' })
      }

      if (sub === '/delegate' && method === 'POST') {
        const body = await readJson(req, 256 * 1024)
        const args = body && typeof body === 'object' ? body : {}
        const result = await delegate(args.sessionId, args.text)
        return sendJson(res, result.ok ? 200 : 400, result)
      }

      if (sub === '/delegate/test' && method === 'POST') {
        const body = await readJson(req, 64 * 1024)
        const args = body && typeof body === 'object' ? body : {}
        const victim = relay.create({ sessionId: state.sessionId || 'session-voice-selftest', text: '自检' })
        relay.capture(victim.sessionId, String(args.text || '自检通过'))
        const finished = relay.finish(victim.sessionId, { ok: args.ok !== false })
        return sendJson(res, 200, { ok: true, id: victim.id, digest: finished ? finished.digest : '', items: relay.list().slice(0, 5) })
      }

      if (sub === '/delegations/cancel' && method === 'POST') {
        const body = await readJson(req, 8192)
        const args = body && typeof body === 'object' ? body : {}
        const cancelled = relay.cancel(args.id)
        return sendJson(res, cancelled ? 200 : 400, cancelled ? { ok: true, id: args.id } : { ok: false, code: 'not-found', message: '委托不存在或已结束' })
      }

      if (sub === '/delegations' && method === 'GET') {
        return sendJson(res, 200, { ok: true, items: relay.list(), history: relay.history(12) })
      }

      if (sub === '/delegations/clear' && method === 'POST') {
        const removed = relay.clearHistory();
        return sendJson(res, 200, { ok: true, removed })
      }

      if (sub === '/delegations/retry' && method === 'POST') {
        const body = await readJson(req, 8192)
        const args = body && typeof body === 'object' ? body : {}
        const prev = relay.historyGet(args.id)
        if (!prev) return sendJson(res, 400, { ok: false, code: 'not-found', message: '历史里没有这条委托' })
        const again = await delegate(prev.sessionId, prev.text)
        if (again.ok) again.retryOf = prev.id
        return sendJson(res, again.ok ? 200 : 400, again)
      }

      if (sub === '/ask/answer' && method === 'POST') {
        const body = await readJson(req, 64 * 1024)
        const args = body && typeof body === 'object' ? body : {}
        const result = answerAsk(args.id, args.text)
        return sendJson(res, result.ok ? 200 : 400, result)
      }

      if (sub === '/asks' && method === 'GET') {
        const items = []
        for (const item of asks.values()) {
          items.push({ id: item.id, sessionId: item.sessionId, question: item.question, options: item.options, createdAt: item.createdAt })
        }
        return sendJson(res, 200, { ok: true, items })
      }

      if (sub === '/smoke' && method === 'POST') {
        const id = 'smoke' + Date.now().toString(36)
        smokeResults.set(id, { id, at: Date.now(), status: 'pending', checks: [] })
        hub.broadcast('smoke', { id })
        return sendJson(res, 200, { ok: true, id, clients: hub.size })
      }

      if (sub === '/smoke-result' && method === 'POST') {
        const body = await readJson(req, 128 * 1024)
        const args = body && typeof body === 'object' ? body : {}
        const id = String(args.id || '')
        const checks = Array.isArray(args.checks) ? args.checks.slice(0, 40).map((c) => ({ name: String((c && c.name) || ''), ok: !!(c && c.ok), detail: String((c && c.detail) || '').slice(0, 160) })) : []
        const failed = checks.filter((c) => !c.ok).length
        smokeResults.set(id, { id, at: Date.now(), status: failed ? 'failed' : 'passed', failed, total: checks.length, checks })
        appendDebug({ tag: 'smoke', data: { id, total: checks.length, failed } })
        return sendJson(res, 200, { ok: true, id, failed, total: checks.length })
      }

      if (sub === '/smoke-results' && method === 'GET') {
        const items = [...smokeResults.values()].sort((a, b) => b.at - a.at).slice(0, 10)
        return sendJson(res, 200, { ok: true, items })
      }

      if (sub === '/context' && method === 'GET') {
        return sendJson(res, 200, contextPayload())
      }

      if (sub === '/session' && method === 'GET') {
        const voiceId = await ensureVoiceSession(null)
        return sendJson(res, 200, { ok: !!voiceId, sessionId: voiceId, voiceSessionId: voiceId })
      }

      if (sub === '/session' && method === 'POST') {
        const body = await readJson(req)
        if (!body) return sendJson(res, 200, { ok: false, code: 'bad-request', message: 'invalid json' })
        if (body.reset) {
          state.voiceSessionId = null
          await releaseVoiceAgent()
        }
        const voiceId = await ensureVoiceSession(typeof body.sessionId === 'string' ? body.sessionId : null)
        return sendJson(res, 200, { ok: !!voiceId, sessionId: voiceId, voiceSessionId: voiceId })
      }

      if (sub === '/start' && method === 'POST') {
        const body = await readJson(req)
        if (!body) return sendJson(res, 200, { ok: false, code: 'bad-request', message: 'invalid json' })
        // 忙线保护：另一个窗口已在通话时，默认不抢麦（需要显式 force 接管）
        if (state.enabled && state.activeTabId && body.tabId && String(body.tabId) !== String(state.activeTabId) && body.force !== true) {
          return sendJson(res, 200, { ok: false, code: 'busy', ownerTabId: state.activeTabId, message: '已经在另一个窗口通话中，点「接管」可以切到这个窗口' })
        }
        const requested = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : null
        const voiceId = await ensureVoiceSession(requested)
        state.enabled = true
        state.sessionId = voiceId
        state.chatSessionId = requested
        state.activeTabId = typeof body.tabId === 'string' ? body.tabId : null
        state.mutedTurn = -1
        settings.merge({ enabled: true })
        refreshAsr()
        setPhase('listening')
        hub.broadcastState()
        void asr.prepare()
        return sendJson(res, 200, { ok: true, voiceSessionId: voiceId, sessionId: voiceId, chatSessionId: requested, state: statePayload() })
      }

      if (sub === '/stop' && method === 'POST') {
        state.enabled = false
        state.sessionId = null
        state.chatSessionId = null
        state.activeTabId = null
        state.mutedTurn = -1
        tts.skip()
        settings.merge({ enabled: false })
        setPhase('idle')
        hub.broadcastState()
        return sendJson(res, 200, { ok: true, state: statePayload() })
      }

      if (sub === '/asr' && method === 'POST') {
        const body = await readJson(req, 12 * 1024 * 1024)
        if (!body) return sendJson(res, 200, { ok: false, code: 'bad-request', message: 'invalid json' })
        const wavBase64 = typeof body.wavBase64 === 'string' ? body.wavBase64 : (typeof body.audioBase64 === 'string' ? body.audioBase64 : '')
        if (!wavBase64) return sendJson(res, 200, { ok: false, code: 'bad-request', message: 'wavBase64 required' })
        const cfg = settings.get()
        const language = typeof body.language === 'string' ? body.language : cfg.language
        const result = await asr.transcribe(wavBase64, language)
        refreshAsr()
        hub.broadcast('asr', { phase: asrView.phase, providerId: asrView.providerId, error: result.ok ? null : result.message })
        if (result.ok) {
          hub.broadcast('transcript', { text: result.text, source: 'asr', sessionId: state.sessionId })
        }
        return sendJson(res, 200, result)
      }

      if (sub === '/speak' && method === 'POST') {
        const body = await readJson(req)
        if (!body) return sendJson(res, 200, { ok: false, code: 'bad-request', message: 'invalid json' })
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        if (!text) return sendJson(res, 200, { ok: false, code: 'bad-request', message: 'text required' })
        let restoreVoice = null
        if (typeof body.voice === 'string' && body.voice) {
          restoreVoice = settings.get().voice
          settings.merge({ voice: body.voice })
        }
        try {
          const buf = await tts.speak(text)
          if (restoreVoice) settings.merge({ voice: restoreVoice })
          const id = tts.store(buf, text)
          return sendJson(res, 200, { ok: true, id, url: BASE + '/audio/' + id })
        } catch (e) {
          if (restoreVoice) settings.merge({ voice: restoreVoice })
          state.lastError = String(e?.message ?? e)
          return sendJson(res, 200, { ok: false, code: 'tts-failed', message: state.lastError })
        }
      }

      if (sub === '/skip' && method === 'POST') {
        tts.skip()
        state.mutedTurn = -1
        if (state.enabled) setPhase('listening')
        hub.broadcastState()
        return sendJson(res, 200, { ok: true, state: statePayload() })
      }

      if (sub === '/interrupt' && method === 'POST') {
        tts.skip()
        state.mutedTurn = state.currentTurn
        if (state.enabled) setPhase('listening')
        hub.broadcastState()
        return sendJson(res, 200, { ok: true, state: statePayload() })
      }

      if (sub === '/cancel-forward' && method === 'POST') {
        return sendJson(res, 200, { ok: false, code: 'unsupported', message: '客户端应自行 steer' })
      }

      if (sub === '/quit' && method === 'POST') {
        appendDebug({ tag: 'app-quit-route' })
        const timer = setTimeout(() => { try { process.exit(0) } catch (e) {} }, 500)
        timer.unref?.()
        return sendJson(res, 200, { ok: true, message: 'quitting' })
      }

      if (sub === '/voices' && method === 'GET') {
        const voices = await loadVoices(url?.searchParams?.get('refresh') === '1')
        return sendJson(res, 200, { ok: true, voices, selected: settings.get().voice })
      }

      if (sub === '/settings') {
        if (method === 'GET') return sendJson(res, 200, settings.get())
        if (method === 'POST') {
          const body = await readJson(req)
          if (!body) return sendJson(res, 200, { ok: false, code: 'bad-request', message: 'invalid json' })
          const patch = body && typeof body.patch === 'object' && body.patch ? body.patch : body
          const next = settings.merge(patch)
          hub.broadcastState()
          return sendJson(res, 200, next)
        }
      }

      if (sub.startsWith('/audio/') && method === 'GET') {
        const id = sub.slice('/audio/'.length)
        const buf = id ? tts.get(id) : null
        if (!buf) return sendJson(res, 404, { ok: false, code: 'not-found', message: 'audio expired' })
        return sendBytes(res, 200, 'audio/mpeg', buf)
      }

      return sendJson(res, 404, { ok: false, code: 'not-found', message: 'unknown route' })
    } catch (e) {
      state.lastError = String(e?.message ?? e)
      try { logger?.warn?.('[voice-companion] route failed:', state.lastError) } catch (e2) {}
      return sendJson(res, 200, { ok: false, code: 'internal', message: state.lastError })
    }
  }

  // ---- 注册路由（必须注入 webServer）----
  try {
    ctx.inject(['webServer'], (scoped) => {
      scoped.effect(() =>
        scoped.webServer.register({
          kind: 'prefix',
          path: BASE,
          handler: (req, res) => { void handle(req, res) }
        })
      )
      try { logger?.info?.('[voice-companion] routes mounted at ' + BASE) } catch (e) {}
    })
  } catch (e) {
    logger?.warn?.('[voice-companion] webServer inject failed:', e?.message)
  }

  // ---- 控制工具（语音会话真正操作 DSH 的入口）----
  try {
    ctx.inject(['tools'], (scoped) => {
      scoped.effect(() => {
        const dispose = registerTools(scoped, {
          sessionsService,
          agentsService,
          ui,
          settings,
          listRecords,
          readRecord,
  readTitle,
  writeTitle,
          deleteRecord,
          clearRecords,
          readDebug,
          appendDebug,
          relay,
          askUser,
          contextPayload,
          currentSessionId: () => state.sessionId,
          focusedSessionId: () => state.chatSessionId,
          retryDelegate: async (id) => {
            const prev = relay.historyGet(id)
            if (!prev) return { ok: false, code: 'not-found', message: '历史里没有这条委托' }
            const again = await delegate(prev.sessionId, prev.text)
            if (again.ok) again.retryOf = prev.id
            return again
          }
        })
        return () => { try { dispose() } catch (e) {} }
      })
    })
    try { logger?.info?.('[voice-companion] control tools registered') } catch (e) {}
  } catch (e) {
    logger?.warn?.('[voice-companion] tools inject failed:', e?.message)
  }

  // ---- 初始化状态 ----
  try {
    const cfg = settings.get()
    state.enabled = false
    refreshAsr()
    if (cfg && cfg.enabled) {
      // 上次退出时在通话中：不自动恢复（没有麦克风），仅记录
      settings.merge({ enabled: false })
    }
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => () => {
        try { hub.close() } catch (e) {}
        try { ui.dispose() } catch (e) {}
        try { tts.skip() } catch (e) {}
        try { if (deltaTimer) clearTimeout(deltaTimer) } catch (e) {}
        void releaseVoiceAgent()
      })
    }
    // 语音会话每次新建都会留一份 session 日志，启动后异步清掉过期的（当前宿主引用的不动）
    try {
      const timer = setTimeout(() => {
        try {
          const live = (() => {
            try {
              const svc = sessionsService()
              return svc && typeof svc.list === 'function' ? svc.list().map((s) => String(s?.id ?? s)) : []
            } catch (e) { return [] }
          })()
          try {
            const cleaned = sanitizeRecords()
            if (cleaned.cleaned) appendDebug({ tag: 'sanitize-records', data: { cleaned: cleaned.cleaned } })
          } catch (e) {}
          try {
            const keepDays = Number(settings.get().recordsKeepDays) || 30
            const oldRecords = pruneOldRecords({ keepDays })
            if (oldRecords.removed.length) {
              appendDebug({ tag: 'prune-records', data: { removed: oldRecords.removed.length, keepDays } })
            }
          } catch (e) {}
          const pruned = pruneVoiceSessionDirs({ keep: live })
          if (pruned.removed.length) {
            appendDebug({ tag: 'prune-voice-sessions', data: { removed: pruned.removed.length, kept: pruned.kept } })
          }
        } catch (e) {}
      }, 5000)
      timer.unref?.()
    } catch (e) {}
  } catch (e) {}
}

// 供离线 harness 复用
export { SentenceSegmenter }
