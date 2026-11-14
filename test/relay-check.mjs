// relay.js 单元检查：委托生命周期 + 摘要清洗
import assert from 'node:assert/strict'
import { createRelay, speechDigest } from '../lib/host/relay.js'

let pass = 0
function ok(name, cond) {
  if (cond) {
    pass += 1
    console.log('PASS', name)
  } else {
    console.log('FAIL', name)
    process.exitCode = 1
  }
}

// 1) 摘要清洗：去掉代码块 / 链接 / Markdown，压成一句话
const dirty = '## 结果\n```js\nconst a = 1\n```\n我改好了 [文件](https://x/y) 里的逻辑，测试通过。'
const digest = speechDigest(dirty)
ok('digest strips fence', !digest.includes('const a = 1'))
ok('digest strips url', !digest.includes('http'))
ok('digest keeps content', digest.includes('测试通过'))

// 2) 长文本截断带省略号
const long = speechDigest('第一句。' + '很长的内容'.repeat(80))
ok('digest truncates', long.length <= 181 && long.endsWith('…'))

// 3) 生命周期：create → isPending → begin → capture → finish
const seen = []
const relay = createRelay({ onComplete: (r) => seen.push(r) })
const item = relay.create({ sessionId: 'session-a', text: '帮我看看南京的岗位' })
ok('create returns id', /^[a-z0-9]{4}$/.test(item.id))
ok('pending true', relay.isPending('session-a') === true)
ok('pending false for other', relay.isPending('session-b') === false)

relay.begin('session-a')
ok('begin marks running', relay.get(item.id).status === 'running')

relay.capture('session-a', '南京有 ')
relay.capture('session-a', '三家在招。')
relay.capture('session-b', '不该被混进来')

const done = relay.finish('session-a', { ok: true })
ok('finish returns digest', done && done.digest === '南京有 三家在招。')
ok('finish marks done', relay.get(item.id).status === 'done')
ok('onComplete called once', seen.length === 1)
ok('pending after finish', relay.isPending('session-a') === false)
ok('other session buffer untouched', relay.finish('session-b') === null)

// 4) 取消
const item2 = relay.create({ sessionId: 'session-c', text: '跑个测试' })
relay.cancel(item2.id)
ok('cancel status', relay.get(item2.id).status === 'cancelled')
ok('cancel keeps list', relay.list().some((i) => i.id === item2.id))

// 5) 失败回合
const item3 = relay.create({ sessionId: 'session-d', text: '做点事' })
relay.capture('session-d', '做到一半')
const failed = relay.finish('session-d', { ok: false })
ok('failed status', relay.get(item3.id).status === 'failed' && failed.ok === false)

// 6) 上限淘汰
const small = createRelay({ max: 2 })
const a = small.create({ sessionId: 's1', text: 'a' })
const b = small.create({ sessionId: 's2', text: 'b' })
const c = small.create({ sessionId: 's3', text: 'c' })
ok('max size enforced', small.size() === 2 && small.get(a.id) === null && small.get(c.id) !== null)

// 7) 回调抛异常不影响状态
const boom = createRelay({
  onComplete: () => {
    throw new Error('speaker down')
  }
})
const d = boom.create({ sessionId: 's9', text: 'x' })
boom.capture('s9', '结果')
let threw = false
try {
  boom.finish('s9', { ok: true })
} catch (e) {
  threw = true
}
ok('callback error swallowed', threw === false && boom.get(d.id).status === 'done')

console.log(`\n===== SUMMARY: ${pass} checks passed =====`)
