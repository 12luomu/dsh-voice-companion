// 工具层单测：注册数量、破坏性操作的 confirm 门禁、委托列表
import assert from 'node:assert'
import { registerTools } from '../lib/host/tools.js'

const defs = new Map()
const ctx = {
  tools: { register(def) { defs.set(def.name, def); return () => {} } },
  get() { return undefined }
}
const noop = () => {}
const deps = {
  sessionsService: () => null,
  agentsService: () => null,
  ui: null,
  settings: { get() { return {} }, merge() {} },
  listRecords: () => [],
  readDebug: () => [],
  appendDebug: noop,
  readRecord: () => ({ ok: true, entries: [] }),
  deleteRecord: () => ({ ok: true, moved: true }),
  clearRecords: () => ({ ok: true, removed: 1 }),
  relay: { create() { return { id: 'test1', sessionId: 's1' } }, list() { return [] }, cancel() { return true } },
  currentSessionId: () => 'session-voice-test',
  focusedSessionId: () => 'session-chat-test',
  askUser: async () => ({ ok: false, code: 'voice-idle' }),
  contextPayload: () => ({ ok: true })
}

registerTools(ctx, deps)

let failed = 0
function check(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log('PASS ' + name),
    (e) => { failed += 1; console.log('FAIL ' + name + ' :: ' + (e && e.message || e)) }
  )
}

await check('工具注册数量 >= 18', () => {
  assert.ok(defs.size >= 18, '只有 ' + defs.size + ' 个工具')
})

await check('voice_tell / voice_ask / voice_context 已注册', () => {
  for (const n of ['voice_tell', 'voice_delegations', 'voice_ask', 'voice_context', 'voice_status']) {
    assert.ok(defs.has(n), n + ' 未注册')
  }
})

for (const [name, args] of [
  ['voice_app_quit', {}],
  ['voice_conversation_archive', { sessionId: 's' }],
  ['voice_records_delete', { sessionId: 's' }],
  ['voice_records_clear', {}]
]) {
  await check('未确认拒绝执行 :: ' + name, async () => {
    const out = await defs.get(name).execute(args, {})
    assert.equal(out.ok, false, '必须返回 ok:false')
    assert.equal(out.code, 'need-confirm', 'code=' + out.code)
  })
}

await check('带 confirm 才真正执行 :: voice_records_delete', async () => {
  const out = await defs.get('voice_records_delete').execute({ sessionId: 's', confirm: true }, {})
  assert.equal(out.ok, true)
})

await check('委托列表可用', async () => {
  const out = await defs.get('voice_delegations').execute({}, {})
  assert.equal(out.ok, true)
  assert.ok(Array.isArray(out.items), 'items 必须是数组')
})

console.log('\n===== tools-check: ' + (failed === 0 ? 'all passed' : failed + ' failed') + ' =====')
if (failed) process.exit(1)
