import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, '..', 'client.js')
const src = fs.readFileSync(srcPath, 'utf8')

let captured = null
const noop = () => {}
const store = new Map()

const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (v) => [typeof v === 'function' ? v() : v, noop],
  useEffect: noop,
  useRef: (v) => ({ current: v }),
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  createPortal: (node) => node,
  Fragment: 'fragment'
}

function fakeEl() {
  const el = {
    style: {}, dataset: {}, children: [],
    setAttribute: noop, removeAttribute: noop, appendChild: noop, removeChild: noop,
    addEventListener: noop, removeEventListener: noop, remove: noop, click: noop,
    querySelector: () => null, querySelectorAll: () => [], contains: () => false,
    closest: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 })
  }
  return el
}

const doc = {
  head: fakeEl(), body: fakeEl(), documentElement: fakeEl(),
  visibilityState: 'visible',
  createElement: () => fakeEl(),
  createTextNode: () => fakeEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener: noop,
  removeEventListener: noop
}

const sandbox = {
  console,
  setTimeout: () => 0,
  clearTimeout: noop,
  setInterval: () => 0,
  clearInterval: noop,
  fetch: () => Promise.reject(new Error('offline')),
  Promise, Map, Set, JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error,
  AbortSignal: { timeout: () => ({}) },
  EventSource: class { constructor() { this.readyState = 1 } addEventListener() {} removeEventListener() {} close() {} },
  AudioContext: class { constructor() { this.state = 'running'; this.sampleRate = 48000; this.destination = fakeEl() } resume() { return Promise.resolve() } close() {} createScriptProcessor() { return { connect: noop, disconnect: noop, onaudioprocess: null } } createMediaStreamSource() { return { connect: noop, disconnect: noop } } createGain() { return { connect: noop, disconnect: noop, gain: { value: 1 } } } createAnalyser() { return { connect: noop, fftSize: 256, getFloatTimeDomainData: noop } } createBufferSource() { return { connect: noop, start: noop, stop: noop } } decodeAudioData() { return Promise.resolve({ duration: 1, getChannelData: () => new Float32Array(16) }) } },
  Audio: class { constructor() { this.src = '' } play() { return Promise.resolve() } pause() {} addEventListener() {} },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: noop },
  Blob: class {},
  document: doc,
  navigator: { mediaDevices: { getUserMedia: () => Promise.reject(new Error('offline')), enumerateDevices: () => Promise.resolve([]) }, language: 'zh-CN' },
  location: { href: 'about:blank', reload: noop },
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: noop
}
sandbox.window = sandbox
sandbox.globalThis = sandbox
sandbox.window.__ModuleLoader__ = { load: (def) => { captured = def } }
sandbox.window.addEventListener = noop
sandbox.window.removeEventListener = noop
sandbox.window.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop })

const context = vm.createContext(sandbox)
let ok = 0, bad = 0
function check(name, fn) {
  try { fn(); console.log('PASS ' + name); ok++ }
  catch (e) { console.log('FAIL ' + name + ' :: ' + (e && e.message)); bad++ }
}

check('脚本可执行（加载期不抛错）', () => {
  new vm.Script(src, { filename: 'client.js' }).runInContext(context)
  if (!captured || typeof captured.factory !== 'function') throw new Error('没有捕获到 factory')
})

let mod = null
check('factory 可求值（模块体不抛错）', () => {
  mod = captured.factory((id) => {
    if (id === 'react') return reactStub
    if (id === 'react-dom') return { createPortal: reactStub.createPortal }
    if (id === 'react/jsx-runtime') return { jsx: reactStub.createElement }
    throw new Error('unexpected require: ' + id)
  })
  if (!mod || typeof mod !== 'object') throw new Error('factory 没有返回模块对象')
})

check('模块导出 apply 与 inject', () => {
  if (typeof mod.apply !== 'function') throw new Error('缺少 apply')
})

check('apply 带假上下文可执行（激活期不抛错）', () => {
  const disposers = []
  const ctx = {
    get: (name) => {
      if (name === 'layout') return { selectPanel: noop, toggleSidebar: noop, beginNavigation: () => ({}) }
      if (name === 'uiWorkspace') return { openSession: noop, openWorkspace: () => Promise.resolve(), startSession: () => Promise.resolve('s') }
      if (name === 'sessions') return { binding: () => undefined, retain: () => ({ ready: Promise.resolve({ session: {} }) }), list: { ids: [] } }
      if (name === 'theme') return { subscribe: noop, get: () => ({}) }
      return undefined
    },
    effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d); return () => {} },
    on: () => () => {},
    slots: { inject: (n, fn) => { fn(); return () => {} }, register: () => () => {} },
    styles: { insert: () => {} },
    locale: { register: () => {} },
    fiber: { entry: {} }
  }
  mod.apply(ctx)
  for (const d of disposers) { try { d() } catch (e) { throw new Error('清理函数抛错：' + (e && e.message)) } }
})

console.log('')
console.log('===== SUMMARY: ' + ok + '/' + (ok + bad) + ' passed =====')
process.exit(bad === 0 ? 0 : 1)
