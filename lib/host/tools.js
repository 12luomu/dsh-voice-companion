// 控制工具集：让语音会话（一个普通 agent 会话）能真正操作 DSH。
// 注册为全局工具，因此所有会话都能看到，但描述里写明「语音助手专用」。
const PANEL_ALIASES = {
  chat: null,
  conversation: null,
  '对话': null,
  sidebar: 'sidebar',
  '侧边栏': 'sidebar',
  side: 'sidebar',
  settings: 'settings',
  '设置': 'settings',
  records: 'voice-records',
  'voice-records': 'voice-records',
  '语音记录': 'voice-records',
  plugins: 'plugins',
  '插件': 'plugins',
  schedules: 'schedules',
  '定时': 'schedules',
  'dsh-context': 'dsh-context',
  context: 'dsh-context',
  '上下文': 'dsh-context',
  mnemon: 'mnemon',
  '记忆': 'mnemon',
  'mcp-connector': 'mcp-connector',
  mcp: 'mcp-connector',
  video: 'video',
  '影视': 'video',
  novel: '@xrn1997/dsh-novel.panel',
  '小说': '@xrn1997/dsh-novel.panel',
  '@xrn1997/dsh-novel.panel': '@xrn1997/dsh-novel.panel'
}
const PANELS = Object.keys(PANEL_ALIASES)

function textOfMessage(message) {
  const parts = []
  const walk = (v, depth) => {
    if (!v || depth > 6) return
    if (typeof v === 'string') { parts.push(v); return }
    if (Array.isArray(v)) { for (const item of v) walk(item, depth + 1); return }
    if (typeof v === 'object') {
      if (typeof v.text === 'string' && (v.type === 'text' || v.type === undefined)) { parts.push(v.text); return }
      if (v.content !== undefined) { walk(v.content, depth + 1); return }
      if (v.message !== undefined) { walk(v.message, depth + 1); return }
    }
  }
  walk(message, 0)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function transcriptOf(session, limit) {
  const out = []
  try {
    if (!session || typeof session.snapshotEvents !== 'function') return out
    const events = session.snapshotEvents(0) || []
    for (const entry of events) {
      if (!entry) continue
      const type = entry.type
      if (type !== 'user/message' && type !== 'assistant/message') continue
      const data = entry.data || {}
      const text = textOfMessage(data.message ?? data)
      if (!text) continue
      out.push({ role: type === 'user/message' ? 'user' : 'assistant', text: text.slice(0, 4000) })
    }
  } catch (e) {}
  const n = Math.max(1, Math.min(80, Number(limit) || 20))
  return out.slice(Math.max(0, out.length - n))
}

function output() {
  return {
    schema: { type: 'object', additionalProperties: true },
    render(_args, value) {
      let text = ''
      try { text = JSON.stringify(value) } catch (e) { text = String(value) }
      return [{ type: 'text', text: text.slice(0, 6000) }]
    }
  }
}

/**
 * 安装控制工具。返回 dispose 函数。
 * deps: { sessionsService, agentsService, ui, readDebug, appendDebug, settings }
 */
export function registerTools(ctx, deps = {}) {
  const disposers = []
  const ui = deps.ui
  const settings = deps.settings
  const appendDebug = deps.appendDebug || (() => {})

  function sessionsOf() {
    try { return deps.sessionsService ? deps.sessionsService() : null } catch (e) { return null }
  }

  function listSessions(limit) {
    const svc = sessionsOf()
    if (!svc || typeof svc.list !== 'function') return []
    let ids = []
    try { ids = svc.list().map((s) => String(s?.id ?? s)) } catch (e) { return [] }
    const items = []
    for (const id of ids) {
      let header = null
      try { header = (svc.get(id) || {}).header || null } catch (e) {}
      let messages = 0
      try {
        const s = svc.get(id)
        if (s && typeof s.snapshotEvents === 'function') messages = (s.snapshotEvents(0) || []).length
      } catch (e) {}
      items.push({
        sessionId: id,
        title: header && typeof header.title === 'string' ? header.title : '',
        cwd: header && typeof header.cwd === 'string' ? header.cwd : '',
        createdAt: header && header.createdAt ? header.createdAt : null,
        voice: id.startsWith('session-voice-'),
        events: messages
      })
    }
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    const n = Math.max(1, Math.min(60, Number(limit) || 20))
    return items.slice(0, n)
  }

  function register(def) {
    try {
      const dispose = ctx.tools.register({
        name: def.name,
        description: def.description,
        parameters: def.parameters || { type: 'object', properties: {}, additionalProperties: false },
        output: output(),
        timeoutMs: def.timeoutMs || 15000,
        isConcurrencySafe: () => false,
        async execute(args) {
          try {
            const value = await def.run(args || {})
            appendDebug({ tag: 'tool', data: { name: def.name, ok: value && value.ok !== false } })
            return value
          } catch (e) {
            const message = String(e?.message ?? e)
            appendDebug({ tag: 'tool-failed', data: { name: def.name, message } })
            return { ok: false, code: 'tool-failed', message }
          }
        }
      })
      if (typeof dispose === 'function') disposers.push(dispose)
      return true
    } catch (e) {
      appendDebug({ tag: 'tool-register-failed', data: { name: def.name, message: String(e?.message ?? e) } })
      return false
    }
  }

  register({
    name: 'voice_conversations_list',
    description: '列出这台 DSH 上的对话会话（标题 / 工作目录 / 事件数 / 是否语音会话），用于回答「我有哪些对话」或挑选目标会话。语音助手专用。',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', description: '最多返回条数，默认 20' } },
      additionalProperties: false
    },
    async run(args) {
      const items = listSessions(args.limit)
      if (!items.length) return { ok: false, code: 'no-sessions', message: '当前没有可见的会话' }
      return { ok: true, count: items.length, sessions: items }
    }
  })

  register({
    name: 'voice_conversation_read',
    description: '读取某个会话最近的对话内容（用户与助手消息），用来回答「那个对话里说了什么」。只读，不会影响那个会话。语音助手专用。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '会话 id，可先用 voice_conversations_list 查询' },
        limit: { type: 'integer', description: '最近多少条消息，默认 20，最大 80' }
      },
      required: ['sessionId'],
      additionalProperties: false
    },
    async run(args) {
      const svc = sessionsOf()
      const id = String(args.sessionId || '')
      if (!svc || !id) return { ok: false, code: 'bad-request', message: '缺少 sessionId' }
      const session = (() => { try { return svc.get(id) } catch (e) { return null } })()
      if (!session) return { ok: false, code: 'no-session', message: '该会话不在内存中（可能已归档或来自上一次启动）' }
      const messages = transcriptOf(session, args.limit)
      if (!messages.length) return { ok: false, code: 'empty', message: '该会话没有可读的文本消息' }
      return { ok: true, sessionId: id, count: messages.length, messages }
    }
  })

  register({
    name: 'voice_conversation_open',
    description: '把 DSH 界面切到指定会话（真的跳转），用户说「打开那个对话/回到某某对话」时用。语音助手专用。',
    parameters: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: '目标会话 id' } },
      required: ['sessionId'],
      additionalProperties: false
    },
    async run(args) {
      if (!ui) return { ok: false, code: 'ui-unavailable', message: 'UI 通道未就绪' }
      const res = await ui.request('session.open', { sessionId: String(args.sessionId || '') })
      return res && res.ok ? { ok: true, sessionId: args.sessionId, result: res.result ?? null } : res
    }
  })

  register({
    name: 'voice_panel_open',
    description: '切换 DSH 的界面视图：chat=回到对话, sidebar=收起/展开侧边栏, plugins=插件面板, schedules=自动化任务, ' +
      'dsh-context=上下文洞察, mnemon=记忆系统, mcp-connector=MCP 连接器, video=影视, novel=小说（真实 key 是 @xrn1997/dsh-novel.panel）, ' +
      'records=语音记录, settings=DSH 设置（侧栏底部那个）。语音助手专用。',
    parameters: {
      type: 'object',
      properties: { panel: { type: 'string', enum: PANELS, description: '要打开的面板' } },
      required: ['panel'],
      additionalProperties: false
    },
    async run(args) {
      if (!ui) return { ok: false, code: 'ui-unavailable', message: 'UI 通道未就绪' }
      const raw = String(args.panel || '')
      if (!Object.prototype.hasOwnProperty.call(PANEL_ALIASES, raw)) {
        return { ok: false, code: 'bad-panel', message: '未知面板：' + raw + '，可用：' + PANELS.join(', ') }
      }
      const panel = PANEL_ALIASES[raw]
      const res = await ui.request('panel.open', { panel: panel == null ? 'chat' : panel })
      return res && res.ok ? { ok: true, panel: raw, opened: panel == null ? 'chat' : panel, result: res.result ?? null } : res
    }
  })

  register({
    name: 'voice_workspaces',
    description: '列出 DSH 的工作区（标题与路径）；传 workspaceId 或 path 则真的切到那个工作区。语音助手专用。',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '要打开的工作区 id（留空只列清单）' },
        path: { type: 'string', description: '要打开的工作区路径（与 workspaceId 二选一）' }
      },
      additionalProperties: false
    },
    async run(args) {
      let registry = null
      try { registry = ctx.get('workspaceRegistry') } catch (e) {}
      let items = []
      try {
        const list = registry && typeof registry.list === 'function' ? registry.list() : []
        items = list.map((w) => ({ workspaceId: String(w?.id ?? ''), title: String(w?.title ?? ''), path: String(w?.path ?? '') }))
      } catch (e) {}
      const targetId = String(args.workspaceId || '')
      const targetPath = String(args.path || '')
      if (!targetId && !targetPath) {
        if (!items.length) return { ok: false, code: 'no-workspaces', message: '没有已知工作区' }
        return { ok: true, count: items.length, workspaces: items }
      }
      if (!ui) return { ok: false, code: 'ui-unavailable', message: 'UI 通道未就绪' }
      const res = await ui.request('workspace.open', { workspaceId: targetId, path: targetPath })
      return res && res.ok ? { ok: true, workspaceId: targetId || null, path: targetPath || null, result: res.result ?? null } : res
    }
  })

  register({
    name: 'voice_send_to_conversation',
    description: '往某个会话里发一条消息。只有在用户明确说出「发给当前对话/发给某某对话」时才可调用；' +
      '调用前必须先口头复述要给谁发、发什么，并得到用户明确同意。语音助手专用。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '目标会话 id；省略表示用户当前打开着的会话' },
        text: { type: 'string', description: '要发送的完整文本' }
      },
      required: ['text'],
      additionalProperties: false
    },
    async run(args) {
      const text = String(args.text || '').trim()
      if (!text) return { ok: false, code: 'bad-request', message: '内容为空' }
      if (!ui) return { ok: false, code: 'ui-unavailable', message: 'UI 通道未就绪' }
      const res = await ui.request('session.send', { sessionId: String(args.sessionId || ''), text })
      return res && res.ok ? { ok: true, sessionId: args.sessionId || 'current', result: res.result ?? null } : res
    }
  })

  register({
    name: 'voice_settings',
    description: '读取或修改语音助手自身的设置（音色、语速、自动发送、唤醒词、打断、朗读范围等）。' +
      '不传 patch 只读；传 patch 为部分更新（只写要改的字段）。语音助手专用。',
    parameters: {
      type: 'object',
      properties: {
        patch: {
          type: 'object',
          description: '要修改的字段，例如 {"voice":"zh-CN-YunxiNeural","rate":"+10%","wakeWord":"小助手","autoSend":true}',
          additionalProperties: true
        }
      },
      additionalProperties: false
    },
    async run(args) {
      if (!settings) return { ok: false, code: 'unavailable', message: '设置不可用' }
      const patch = args.patch
      if (!patch || typeof patch !== 'object') return { ok: true, settings: settings.get() }
      const next = settings.merge(patch)
      return { ok: true, settings: next }
    }
  })

  register({
    name: 'voice_records_list',
    description: '列出保存下来的语音对话记录（每次语音通话一份），用于回答「我们之前语音聊过什么」。语音助手专用。',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    async run() {
      const items = deps.listRecords ? deps.listRecords() : []
      if (!items.length) return { ok: false, code: 'empty', message: '还没有保存的语音记录' }
      return { ok: true, count: items.length, records: items.slice(0, 30) }
    }
  })

  register({
    name: 'voice_app_quit',
    description: '退出 DSH（关闭整个应用）。调用前必须先告诉用户"这会关掉 DSH，需要重新打开"，并拿到用户明确的口头同意。语音助手专用。',
    parameters: { type: 'object', properties: { confirm: { type: 'boolean', description: '必须为 true 才会执行；未确认时工具会拒绝并提示先用 voice_ask 征得同意' } }, additionalProperties: false },
    async run(args) {
      if (!args || args.confirm !== true) return { ok: false, code: 'need-confirm', message: '这是破坏性操作：先向用户说明后果，用 voice_ask 征得同意后，再带 confirm:true 重试。' }
      appendDebug({ tag: 'app-quit' })
      const timer = setTimeout(() => {
        try { process.exit(0) } catch (e) {}
      }, 900)
      timer.unref?.()
      return { ok: true, message: '正在退出 DSH' }
    }
  })

  register({
    name: 'voice_conversation_new',
    description: '新建一个 DSH 对话（真的创建并切过去）。用户说「新开一个对话」时用。语音助手专用。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async run() {
      if (!ui) return { ok: false, code: 'ui-unavailable', message: 'UI 通道未就绪' }
      const res = await ui.request('session.new', {})
      return res && res.ok ? { ok: true, sessionId: res.result && res.result.sessionId ? res.result.sessionId : null } : res
    }
  })

  register({
    name: 'voice_conversation_archive',
    description: '归档（收进归档区）某个对话。属于破坏性操作，执行前要先向用户确认。语音助手专用。',
    parameters: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: '要归档的会话 id' }, confirm: { type: 'boolean', description: '必须为 true 才会执行；未确认时工具会拒绝并提示先用 voice_ask 征得同意' } },
      required: ['sessionId'],
      additionalProperties: false
    },
    async run(args) {
      if (!args || args.confirm !== true) return { ok: false, code: 'need-confirm', message: '这是破坏性操作：先向用户说明后果，用 voice_ask 征得同意后，再带 confirm:true 重试。' }
      if (!ui) return { ok: false, code: 'ui-unavailable', message: 'UI 通道未就绪' }
      const res = await ui.request('session.archive', { sessionId: String(args.sessionId || '') })
      return res && res.ok ? { ok: true, sessionId: args.sessionId } : res
    }
  })

  register({
    name: 'voice_conversation_rename',
    description: '给某个对话改标题。语音助手专用。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '会话 id' },
        title: { type: 'string', description: '新标题' }
      },
      required: ['sessionId', 'title'],
      additionalProperties: false
    },
    async run(args) {
      if (!ui) return { ok: false, code: 'ui-unavailable', message: 'UI 通道未就绪' }
      const res = await ui.request('session.rename', { sessionId: String(args.sessionId || ''), title: String(args.title || '') })
      return res && res.ok ? { ok: true, title: args.title } : res
    }
  })

  register({
    name: 'voice_records_read',
    description: '读取某一份保存下来的语音记录的全部内容（用户与助手逐句文本）。语音助手专用。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '语音会话 id（可先用 voice_records_list 查）' },
        limit: { type: 'integer', description: '最多多少条，默认 200' }
      },
      required: ['sessionId'],
      additionalProperties: false
    },
    async run(args) {
      if (!deps.readRecord) return { ok: false, code: 'unavailable', message: '记录服务不可用' }
      const out = deps.readRecord(String(args.sessionId || ''), { limit: Number(args.limit) || 200 })
      return out
    }
  })

  register({
    name: 'voice_records_delete',
    description: '删除一份语音记录。属于破坏性操作，执行前要先向用户确认。语音助手专用。',
    parameters: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: '要删除的记录 id' }, confirm: { type: 'boolean', description: '必须为 true 才会执行；未确认时工具会拒绝并提示先用 voice_ask 征得同意' } },
      required: ['sessionId'],
      additionalProperties: false
    },
    async run(args) {
      if (!args || args.confirm !== true) return { ok: false, code: 'need-confirm', message: '这是破坏性操作：先向用户说明后果，用 voice_ask 征得同意后，再带 confirm:true 重试。' }
      if (!deps.deleteRecord) return { ok: false, code: 'unavailable', message: '记录服务不可用' }
      const id = String(args.sessionId || '')
      if (!id) return { ok: false, code: 'bad-request', message: '缺少 sessionId' }
      return deps.deleteRecord(id)
    }
  })

  register({
    name: 'voice_records_clear',
    description: '清空全部语音记录。属于破坏性操作，必须先说明并拿到用户明确同意。语音助手专用。',
    parameters: { type: 'object', properties: { confirm: { type: 'boolean', description: '必须为 true 才会执行；未确认时工具会拒绝并提示先用 voice_ask 征得同意' } }, additionalProperties: false },
    async run(args) {
      if (!args || args.confirm !== true) return { ok: false, code: 'need-confirm', message: '这是破坏性操作：先向用户说明后果，用 voice_ask 征得同意后，再带 confirm:true 重试。' }
      if (!deps.clearRecords) return { ok: false, code: 'unavailable', message: '记录服务不可用' }
      return deps.clearRecords()
    }
  })


  // 委托：把任务交给某个对话去执行，完成时由宿主把结论念回来
  register({
    name: 'voice_tell',
    description:
      '把任务委托给某个 DSH 对话去执行（默认当前对话）。消息里会带【语音委托 #id】标记；对方回合结束后，宿主会自动把结论简要念给你听，不需要你轮询。适合需要真正读文件、跑命令、改代码、查资料的任务。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '目标对话 id；省略则用当前打开的对话' },
        text: { type: 'string', description: '要委托的具体任务（说人话，写清目标和交付物）' }
      },
      required: ['text'],
      additionalProperties: false
    },
    async run(args) {
      if (!deps.relay || !deps.ui) return { ok: false, code: 'unavailable', message: '委托服务不可用' }
      const text = String(args.text || '').trim()
      if (!text) return { ok: false, code: 'bad-request', message: '缺少要委托的内容' }
      if (text.indexOf('【语音委托 #') >= 0 || text.indexOf('【语音回问 #') >= 0) {
        return { ok: false, code: 'echo', message: '这段内容带着委托/回问标记，属于回声，不再转交（防循环）' }
      }
      const sid = String(args.sessionId || '') || (deps.focusedSessionId && deps.focusedSessionId()) || ''
      if (!sid) return { ok: false, code: 'no-session', message: '没有可用的目标对话，请先打开一个对话再委托' }
      const item = deps.relay.create({ sessionId: sid, text })
      const message =
        '【语音委托 #' + item.id + '】' + text +
        '\n\n（这条消息来自语音助手，用户在语音里交办。请在这个对话里直接处理；处理完用 2~3 句中文总结结果与关键数字，会念给用户听。）'
      const resp = await deps.ui.request('session.send', { sessionId: sid, text: message }, { wait: true, timeoutMs: 12000 })
      if (!resp || resp.ok === false) {
        deps.relay.cancel(item.id)
        return { ok: false, code: (resp && resp.code) || 'send-failed', message: (resp && resp.message) || '没能把消息投递到目标对话' }
      }
      return { ok: true, id: item.id, sessionId: sid, status: 'dispatched', note: '已经交给对话处理，完成后会自动念结果' }
    }
  })

  register({
    name: 'voice_delegations',
    description: '查看委托：默认列正在跑的；history=true 列最近的委托历史；传 id + cancel=true 取消仍在跑的；传 retry=<历史 id> 重新派发同一件事。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '委托 id（4 位短码）' },
        cancel: { type: 'boolean', description: '是否取消这条委托' },
        history: { type: 'boolean', description: '是否列出委托历史（含已完成/失败/取消的）' },
        retry: { type: 'string', description: '要重试的历史委托 id' }
      },
      additionalProperties: false
    },
    async run(args) {
      if (!deps.relay) return { ok: false, code: 'unavailable', message: '委托服务不可用' }
      const id = String(args.id || '').trim()
      const retryId = String(args.retry || '').trim()
      if (retryId) {
        if (!deps.retryDelegate) return { ok: false, code: 'unavailable', message: '重试服务不可用' }
        return await deps.retryDelegate(retryId)
      }
      if (id && args.cancel) {
        const item = deps.relay.cancel(id)
        if (!item) return { ok: false, code: 'not-found', message: '没有这条委托' }
        return { ok: true, item }
      }
      if (args.history) return { ok: true, items: deps.relay.list(), history: deps.relay.history(20) }
      return { ok: true, items: deps.relay.list() }
    }
  })

  // 反向回问：需要用户拍板时，用语音问一句并等口头回答
  register({
    name: 'voice_ask',
    description: '在主对话里需要用户拍板时，用语音问用户一个问题，并等口头回答（默认最多等 60 秒；超时会返回 code=timeout，不挂死）。适合二选一确认、参数确认、是否继续这类场景。',
    timeoutMs: 130000,
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要念给用户听的问题，一句短问句' },
        options: { type: 'array', items: { type: 'string' }, description: '可选，给用户的口头选项（如 ["继续","取消"]）' },
        timeoutMs: { type: 'integer', description: '最多等多久（毫秒），默认 60000，范围 5000-180000' }
      },
      required: ['question'],
      additionalProperties: false
    },
    async run(args) {
      if (!deps.askUser) return { ok: false, code: 'unavailable', message: '语音回问不可用' }
      const r = await deps.askUser({ question: args.question, options: args.options, timeoutMs: args.timeoutMs })
      if (!r || r.ok === false) {
        return { ok: false, code: (r && r.code) || 'ask-failed', message: (r && r.message) || '用户没有回答', question: String(args.question || '') }
      }
      return { ok: true, answer: r.answer }
    }
  })

  // 情境共享：语音侧看前台对话概况
  register({
    name: 'voice_context',
    description: '查看用户当前前台对话的简要情况：标题、工作区目录、是否在运行、最近几条消息摘要、待处理的委托数。只返回摘要，不含全文。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async run() {
      if (!deps.contextPayload) return { ok: false, code: 'unavailable', message: '情境共享不可用' }
      return deps.contextPayload()
    }
  })

  // 情境共享：主对话侧看语音助手状态
  register({
    name: 'voice_status',
    description: '查看语音助手当前状态：是否在通话、阶段、语音会话 id、待处理委托数。主对话里想知道"用户在不在语音里"时用。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async run() {
      const ctxPayload = deps.contextPayload ? deps.contextPayload() : null
      return {
        ok: true,
        active: !!(ctxPayload && ctxPayload.voice && ctxPayload.voice.active),
        voice: ctxPayload ? ctxPayload.voice : null,
        voiceSessionId: deps.currentSessionId ? deps.currentSessionId() : null,
        focusedSessionId: deps.focusedSessionId ? deps.focusedSessionId() : null
      }
    }
  })

  // 调试用：最近的语音/工具日志
  register({
    name: 'voice_debug_tail',
    description: '读取语音助手最近的调试日志（排查朗读、识别、发送异常时用）。语音助手专用。',
    parameters: {
      type: 'object',
      properties: { lines: { type: 'integer', description: '最多返回多少行，默认 40' } },
      additionalProperties: false
    },
    async run(args) {
      const lines = deps.readDebug ? deps.readDebug(Math.max(1, Math.min(200, Number(args.lines) || 40))) : []
      return { ok: true, lines }
    }
  })

  return function dispose() {
    for (const d of disposers) { try { d() } catch (e) {} }
    disposers.length = 0
  }
}

// 供离线测试
export const _internal = { textOfMessage, transcriptOf, PANELS }
