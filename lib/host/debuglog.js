// 客户端行为诊断日志：DSH_HOME/voice-companion/client.log（单文件，超过 256KB 时轮转一次）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LIMIT = 256 * 1024

function logFile() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'voice-companion', 'client.log')
}

export function appendDebug(entry) {
  try {
    const file = logFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    try {
      const st = fs.statSync(file)
      if (st.size > LIMIT) {
        try { fs.renameSync(file, file + '.1') } catch (e) {}
      }
    } catch (e) {}
    const line = JSON.stringify(Object.assign({ at: new Date().toISOString() }, entry))
    fs.appendFileSync(file, line + '\n')
  } catch (e) {
    // 诊断失败绝不影响主流程
  }
}

export function readDebug(limitLines) {
  try {
    const file = logFile()
    const txt = fs.readFileSync(file, 'utf8')
    const lines = txt.split('\n').filter(Boolean)
    const n = Math.max(1, Math.min(400, limitLines || 80))
    return lines.slice(Math.max(0, lines.length - n))
  } catch (e) {
    return []
  }
}
