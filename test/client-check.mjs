// dsh-voice-companion 客户端静态检查（无框架，assert 即可）
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import assert from 'node:assert/strict'

const FILE = new URL('../client.js', import.meta.url)
const src = readFileSync(FILE, 'utf8')
const results = []
function check(name, fn) {
  try { fn(); results.push(['PASS', name, '']) } catch (e) { results.push(['FAIL', name, e.message]) }
}

check('client.js 存在且非空', () => {
  assert.ok(existsSync(FILE), 'client.js 不存在')
  assert.ok(src.length > 20000, 'client.js 太小: ' + src.length)
})

check('不 require @deepseek-ai/*', () => {
  const m = src.match(/require\(\s*['"]@deepseek-ai\/[^'"]+['"]\s*\)/g)
  assert.equal(m, null, '出现禁用依赖: ' + (m || []).join(','))
})

check('require 的模块都在白名单内', () => {
  const allowed = new Set(['react', 'react-dom', 'react/jsx-runtime'])
  const mods = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1])
  const bad = mods.filter(m => !allowed.has(m))
  assert.deepEqual(bad, [], '出现白名单外的 require: ' + bad.join(','))
})

check('无 JSX 尖括号组件写法', () => {
  // <Tag ...> 或 </Tag> 且 Tag 首字母大写/含点号
  const m = src.match(/<\/?[A-Z][A-Za-z0-9_.]*[\s/>]/g)
  assert.equal(m, null, '疑似 JSX: ' + (m || []).slice(0, 5).join(','))
})

check('固定浮层不在 composer 内（shell.overlay + fixed，无需 portal）', () => {
  // 架构选择：通话面板注册在 root 级 shell.overlay，不注入 composer 插槽，
  // 因此不受 composer contain/stacking 裁剪，无需 createPortal。
  assert.ok(src.includes('shell.overlay'), '缺少 shell.overlay 注册')
  const m = src.match(/\.vc-panel\{[^}]*position:fixed/)
  assert.ok(m, 'vc-panel 不是 position:fixed')
  const composerRegs = (src.match(/conversation\.input\.[a-z]+['"]\s*,\s*function/g) || []).length
  assert.ok(composerRegs <= 2, 'composer 内注册过多: ' + composerRegs)
})

check('使用 EventSource 订阅 /events', () => {
  assert.ok(/new EventSource\(/.test(src), '缺少 EventSource')
  assert.ok(/\/events\?tabId=/.test(src), '缺少 /events?tabId 调用')
})

check('录音→WAV 链完整（ScriptProcessor 环形缓冲 + 手动重采样）', () => {
  assert.ok(/createScriptProcessor/.test(src), '缺少 createScriptProcessor')
  assert.ok(/function resampleTo16k/.test(src), '缺少 resampleTo16k')
  assert.ok(/function encodeWav16k/.test(src), '缺少 encodeWav16k')
})

check('window.__ModuleLoader__.load 只出现一次', () => {
  const n = (src.match(/__ModuleLoader__\.load/g) || []).length
  assert.equal(n, 1, '__ModuleLoader__.load 出现 ' + n + ' 次')
})

check('模块 id 与 package name 一致', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(src.includes("id: '" + pkg.name + "'") || src.includes('id: "' + pkg.name + '"'), 'load({id}) 与 package name 不一致')
})

check('样式 token 优先（写死颜色只能作为 var() 兜底）', () => {
  const bad = []
  const re = /var\(--dsw-alias-[a-z0-9-]+\s*,\s*([^)]*)\)/g
  let m
  const allowed = new Set()
  while ((m = re.exec(src))) allowed.add(m[1].trim())
  const allColors = [...src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(c => c[0])
  for (const c of allColors) {
    const inFallback = [...allowed].some(v => v.includes(c))
    if (!inFallback) bad.push(c)
  }
  assert.deepEqual(bad, [], '颜色没有 var() 兜底上下文: ' + bad.slice(0, 6).join(','))
  assert.ok(/--dsw-alias-/.test(src), '完全没有使用主题 token')
})

check('注册了工具栏麦克风按钮与全框面板', () => {
  assert.ok(src.includes('conversation.input.right'), '缺少 conversation.input.right 插槽')
  assert.ok(src.includes('shell.overlay'), '缺少 shell.overlay 插槽')
})

check('发送消息走 session.prompt', () => {
  assert.ok(/\.prompt\(/.test(src), '缺少 session.prompt')
  assert.ok(/'steer'/.test(src), "缺少 'steer' 模式")
})

check('client.js 语法可解析（node --check）', () => {
  const m = src.match(/factory\s*\(\s*require\s*\)\s*\{/)
  assert.ok(m, '找不到 factory(require) 外壳')
  const vm = require('node:vm')
  new vm.Script(src, { filename: 'client.js' })
})

let failed = 0
for (const [status, name, msg] of results) {
  if (status === 'FAIL') failed++
  console.log(status + ' ' + name + (msg ? ' :: ' + msg : ''))
}
console.log('\n===== SUMMARY: ' + (results.length - failed) + '/' + results.length + ' passed =====')
process.exit(failed ? 1 : 0)
