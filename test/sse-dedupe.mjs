// 验证：同一 tabId 只保留一条 SSE，重复连接会被服务端顶掉（避免同一条回复被投递两次）。
// 需要宿主正在运行：node test/sse-dedupe.mjs [port]
import http from 'node:http'

const port = Number(process.argv[2] || 55712)
const base = { host: '127.0.0.1', port, path: '/voice-companion/events?tabId=dedupe-test' }

function open(name) {
  const rec = { name, events: [], closed: false, ended: false }
  const req = http.get(base, (res) => {
    res.setEncoding('utf8')
    let buf = ''
    res.on('data', (chunk) => {
      buf += chunk
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const m = /^event: (.+)$/m.exec(block)
        if (m) rec.events.push(m[1])
      }
    })
    res.on('end', () => { rec.ended = true })
  })
  req.on('error', () => { rec.closed = true })
  rec.close = () => { try { req.destroy() } catch (e) {} }
  return rec
}

function post(path, body) {
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(body)).toString('base64')
    const req = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(JSON.stringify(body)) } }, (res) => {
      res.resume(); res.on('end', resolve)
    })
    req.on('error', resolve)
    req.write(JSON.stringify(body)); req.end()
  })
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, ok, detail) { results.push({ name, ok, detail: detail || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')) }

const a = open('A')
await wait(400)
const b = open('B')
await wait(400)
await post('/voice-companion/smoke', {})
await wait(900)
const aSmoke = a.events.filter((e) => e === 'smoke').length
const bSmoke = b.events.filter((e) => e === 'smoke').length
check('旧连接被顶掉', a.ended === true || a.closed === true, 'ended=' + a.ended)
check('只有一条连接收到广播', aSmoke + bSmoke === 1, 'A=' + aSmoke + ' B=' + bSmoke)
check('新连接收到广播', bSmoke === 1, 'B=' + bSmoke)
a.close(); b.close()
const failed = results.filter((r) => !r.ok).length
console.log('\nSUMMARY: ' + (results.length - failed) + '/' + results.length + ' passed')
process.exit(failed ? 1 : 0)
