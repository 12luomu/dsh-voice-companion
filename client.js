/* dsh-voice-companion — 实时语音伙伴（客户端半）
 * 说话 → 自动发送 / 助手回复 → 逐句 Edge TTS 朗读 / 可语音打断
 * 无 JSX、不依赖任何 @deepseek-ai/* 包；只用 react / react-dom。
 */
window.__ModuleLoader__.load({
  id: 'dsh-voice-companion',
  factory(require) {
    'use strict'
    var React = require('react')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var useRef = React.useRef
    var useSyncExternalStore = React.useSyncExternalStore

    var BASE = '/voice-companion'
    var NS = 'dsh-voice-companion'
    var TAB_KEY = 'vc-tab-id'
    var TAB_ID = (function () {
      try {
        var v = window.sessionStorage.getItem(TAB_KEY)
        if (!v) {
          v = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 'tab-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
          window.sessionStorage.setItem(TAB_KEY, v)
        }
        return v
      } catch (e) {
        return 'tab-' + Math.random().toString(36).slice(2)
      }
    })()

    /* ------------------------------------------------------------------ */
    /* i18n                                                               */
    /* ------------------------------------------------------------------ */
    var STRINGS = {
      zh: {
        name: '语音伙伴', description: '实时语音对话：说话自动发送，回复逐句朗读，可语音打断',
        mic: '语音通话', listening: '聆听中…', thinking: '思考中…', speaking: '正在朗读', idle: '待机',
        hangup: '结束通话', skip: '停止朗读', interrupt: '打断', settings: '设置',
        voice: '音色', rate: '语速', autoSend: '自动发送', bargeIn: '允许语音打断',
        wakeWord: '唤醒词', wakeWordOff: '不启用', sensitivity: '麦克风灵敏度',
        otherTab: '另一个标签页正在通话', fallbackVoice: '已回退系统语音',
        manualSend: '请手动按回车发送', micDenied: '麦克风被拒绝：',
        asrNotReady: '语音识别模型尚未就绪，稍后自动重试', noSpeech: '没听清，再说一次',
        thinkingTimeout: '助手没有回应，请再说一次',
        empty: '（空）', you: '你', me: '助手', expand: '展开', collapse: '收起',
        retry: '重试', connecting: '连接中…'
      },
      en: {
        name: 'Voice Companion', description: 'Real-time voice chat: auto-send speech, read replies aloud, barge-in',
        mic: 'Voice call', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking', idle: 'Idle',
        hangup: 'Hang up', skip: 'Stop reading', interrupt: 'Interrupt', settings: 'Settings',
        voice: 'Voice', rate: 'Rate', autoSend: 'Auto send', bargeIn: 'Voice interrupt',
        wakeWord: 'Wake word', wakeWordOff: 'Off', sensitivity: 'Mic sensitivity',
        otherTab: 'Another tab is in a call', fallbackVoice: 'Fell back to system voice',
        manualSend: 'Press Enter to send', micDenied: 'Microphone denied: ',
        asrNotReady: 'Speech model is warming up, retrying', noSpeech: 'Did not catch that',
        thinkingTimeout: 'The assistant did not respond, please try again',
        empty: '(empty)', you: 'You', me: 'Agent', expand: 'More', collapse: 'Less',
        retry: 'Retry', connecting: 'Connecting…'
      }
    }
    var LANG = 'zh'
    var EXTRA = {
      zh: {
        delegTitle: '委托',
        delegHistory: '历史委托',
        delegRetry: '重试',
        recordsExportAll: '导出全部',
        usageHint: '当前话题轮次 / 自动换话题阈值',
        delegDone: '已完成',
        delegFail: '未完成',
        delegQueued: '排队中',
        elsewhere: '已在别处通话',
        takeOver: '接管',
        recordsSearchHits: '跨话题搜索',
        roleUser: '你',
        roleAssistant: '助手',
        runSmoke: '运行页面自检',
        smokeResult: '自检结果',
        delegWorking: '处理中',
        delegCancel: '取消委托',
        recordsRename: '改名',
        recordsRenamePrompt: '给这个话题起个新标题',
        recordsRegen: '重新起名',
        orbIdle: '待机中',
        idleTag: '待机中',
        idleStart: '开启通话',
        idleHint: '点击开启语音通话',
        orbGesture: '点击启用语音',
        orbStart: '开始语音通话',
        mute: '静音麦克风',
        unmute: '恢复麦克风',
        autoStart: '打开页面即自动开麦',
        chime: '唤醒提示音',
        subtitles: '显示字幕',
        duck: '朗读时压低环境音',
        muted: '麦克风已关闭',
        pitch: '音调',
        volume: '音量',
        lang: '识别语言',
        langAuto: '自动',
        recordsEntry: '语音记录',
        orbExpand: '展开语音对话',
        orbReveal: '点击展开小助手',
        fanMic: '麦克风',
        fanCard: '打开卡片',
        fanHistory: '历史记录',
        recordsJump: '打开对话',
        recordsPlayAll: '朗读全部',
        recordsSearchIn: '搜索这段记录',
        recordsAt: '时间',
        recordsConfirmDelete: '确定删除这条语音记录吗？',
        recordsConfirmClear: '确定清空全部语音记录吗？',
        micRetry: '重连麦克风',
        newSession: '新话题',
        clear: '清空记录',
        records: '语音记录',
        recordsTitle: '语音记录管理',
        recordsEmpty: '还没有语音记录',
        recordsLoading: '读取中…',
        recordsFilter: '搜索记录内容',
        recordsOpen: '查看',
        recordsHistory: '历史',
        recordsTopic: '话题',
        recordsBack: '返回列表',
        recordsPlay: '试听这一句',
        recordsDelete: '删除这条记录',
        recordsExport: '导出 Markdown',
        recordsClear: '清空全部记录',
        recordsCount: '条',
        recordsTurns: '条对话',
        recordsHint: '每条记录按会话保存，可试听、导出或删除',
        autoHide: '自动收起悬浮球',
        autoHideOff: '不自动收起'
      },
      en: {
        delegTitle: 'Delegations',
        delegHistory: 'Past delegations',
        delegRetry: 'Retry',
        recordsExportAll: 'Export all',
        usageHint: 'turns in this topic / auto-rotate threshold',
        delegDone: 'done',
        delegFail: 'failed',
        delegQueued: 'queued',
        elsewhere: 'Call elsewhere',
        takeOver: 'Take over',
        recordsSearchHits: 'Search results',
        roleUser: 'you',
        roleAssistant: 'assistant',
        runSmoke: 'Run page self-test',
        smokeResult: 'Self-test',
        delegWorking: 'Working…',
        delegCancel: 'Cancel delegation',
        recordsRename: 'Rename',
        recordsRenamePrompt: 'New title for this topic',
        recordsRegen: 'Regenerate title',
        orbIdle: 'Standing by',
        idleTag: 'Standing by',
        idleStart: 'Start call',
        idleHint: 'Click to start voice call',
        orbGesture: 'Tap to enable',
        orbStart: 'Start voice call',
        mute: 'Mute microphone',
        unmute: 'Unmute microphone',
        autoStart: 'Auto-open mic on load',
        chime: 'Wake chime',
        subtitles: 'Show subtitles',
        duck: 'Duck while speaking',
        muted: 'Microphone off',
        pitch: 'Pitch',
        volume: 'Volume',
        lang: 'Recognition language',
        langAuto: 'Auto',
        recordsEntry: 'Voice records',
        orbExpand: 'Open voice chat',
        orbReveal: 'Click to expand',
        fanMic: 'Microphone',
        fanCard: 'Open card',
        fanHistory: 'History',
        recordsJump: 'Open chat',
        recordsPlayAll: 'Read all',
        recordsSearchIn: 'Search this record',
        recordsAt: 'Time',
        recordsConfirmDelete: 'Delete this voice record?',
        recordsConfirmClear: 'Clear all voice records?',
        micRetry: 'Reconnect mic',
        newSession: 'New topic',
        clear: 'Clear',
        records: 'Voice records',
        recordsTitle: 'Voice records',
        recordsEmpty: 'No voice records yet',
        recordsLoading: 'Loading…',
        recordsFilter: 'Search transcripts',
        recordsOpen: 'Open',
        recordsHistory: 'History',
        recordsTopic: 'Topic',
        recordsBack: 'Back',
        recordsPlay: 'Replay',
        recordsDelete: 'Delete',
        recordsExport: 'Export Markdown',
        recordsClear: 'Clear all',
        recordsCount: '',
        recordsTurns: 'turns',
        recordsHint: 'Each call is stored per session; replay, export or delete',
        autoHide: 'Auto-hide floating ball',
        autoHideOff: 'Never auto-hide'
      }
    }
    function t(key) {
      var x = EXTRA[LANG] || EXTRA.zh
      if (x[key] !== undefined) return x[key]
      var d = STRINGS[LANG] || STRINGS.zh
      if (d[key] !== undefined) return d[key]
      return STRINGS.zh[key] !== undefined ? STRINGS.zh[key] : key
    }

    /* ------------------------------------------------------------------ */
    /* utils                                                              */
    /* ------------------------------------------------------------------ */
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
    function nowId() {
      return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    }
    function escapeRe(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

    /* 语音归一化：去标点/空格/大小写，用于唤醒词与回声比对 */
    function normalizeSpeech(text) {
      return String(text || '').replace(/[\s，。,.！!？?、~～：:；;\-_/\\|()（）「」“”"'’]+/g, '').toLowerCase()
    }
    function wakeAliases(wakeWord) {
      return String(wakeWord || '').split(/[,，/|、]+/).map(normalizeSpeech).filter(function (w) { return !!w })
    }
    function headDiff(s, a) {
      var n = Math.min(s.length, a.length)
      var diff = 0
      for (var i = 0; i < n; i += 1) if (s[i] !== a[i]) diff += 1
      return diff + Math.abs(s.length - a.length)
    }
    /* 归一化文本开头匹配唤醒词：先精确，再容忍 1 个字的同音/漏字（长度 >=3 才容错）。
       返回实际消耗的归一化字符数，-1 表示没匹配上。 */
    function wakeHeadLen(norm, alias) {
      if (norm.indexOf(alias) === 0) return alias.length
      if (alias.length < 3) return -1
      var lo = Math.max(2, alias.length - 1)
      var hi = Math.min(norm.length, alias.length + 1)
      for (var w = lo; w <= hi; w += 1) {
        if (headDiff(norm.slice(0, w), alias) <= 1) return w
      }
      return -1
    }
    /* 唤醒词只认开头；支持多别名；返回剩余指令文本 */
    function matchWake(text, wakeWord) {
      var norm = normalizeSpeech(text)
      var aliases = wakeAliases(wakeWord)
      for (var i = 0; i < aliases.length; i += 1) {
        var a = aliases[i]
        if (!a) continue
        var used = wakeHeadLen(norm, a)
        if (used > 0) {
          var acc = ''
          var cut = text.length
          for (var k = 0; k < text.length; k += 1) {
            acc += text[k]
            if (normalizeSpeech(acc).length >= used) { cut = k + 1; break }
          }
          return { rest: text.slice(cut).replace(/^[\s，。,.！!？?、~～：:；;]+/, '').trim(), fuzzy: used !== a.length }
        }
      }
      return null
    }
    function delay(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

    function rawApi(path, init) {
      var opts = {}
      var base = init || {}
      for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) opts[k] = base[k]
      opts.headers = Object.assign({ 'content-type': 'application/json' }, base.headers || {})
      if (opts.body !== undefined && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body)
      try {
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(15000)
      } catch (e) {}
      return fetch(BASE + path, opts).then(function (res) {
        return res.text().then(function (txt) {
          var data = null
          try { data = txt ? JSON.parse(txt) : null } catch (e) { data = { ok: false, code: 'bad-json', message: String(txt).slice(0, 200) } }
          if (!res.ok && (!data || data.ok !== false)) data = { ok: false, code: 'http-' + res.status, message: String(res.status) }
          return data || { ok: false, code: 'empty', message: 'empty response' }
        })
      })
    }

    function api(path, init) {
      return rawApi(path, init).catch(function () {
        return delay(250).then(function () { return rawApi(path, init) }).catch(function (e2) {
          return { ok: false, code: 'network', message: String((e2 && e2.message) || e2) }
        })
      })
    }

    function createStore(initial) {
      var state = initial
      var listeners = new Set()
      function get() { return state }
      function set(patch) {
        var next = typeof patch === 'function' ? patch(state) : Object.assign({}, state, patch)
        if (!next || next === state) return
        state = next
        listeners.forEach(function (fn) { try { fn() } catch (e) {} })
      }
      function subscribe(fn) { listeners.add(fn); return function () { listeners.delete(fn) } }
      return { get: get, set: set, subscribe: subscribe, listeners: listeners }
    }

    function useStore(store) {
      var target = store || runtime.store
      return useSyncExternalStore(target.subscribe, target.get, target.get)
    }

    /* ------------------------------------------------------------------ */
    /* WAV encode + resample                                              */
    /* ------------------------------------------------------------------ */
    function resampleTo16k(input, inputRate) {
      var target = 16000
      if (!input || input.length === 0) return new Float32Array(0)
      if (Math.abs(inputRate - target) < 1) return input
      var ratio = inputRate / target
      var outLen = Math.max(1, Math.floor(input.length / ratio))
      var out = new Float32Array(outLen)
      for (var i = 0; i < outLen; i++) {
        var pos = i * ratio
        var i0 = Math.floor(pos)
        var frac = pos - i0
        var a = input[i0] || 0
        var b = input[i0 + 1] !== undefined ? input[i0 + 1] : a
        out[i] = a + (b - a) * frac
      }
      return out
    }

    function encodeWav16k(float32) {
      var samples = float32.length
      var view = new DataView(new ArrayBuffer(44 + samples * 2))
      function writeStr(off, s) { for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
      writeStr(0, 'RIFF')
      view.setUint32(4, 36 + samples * 2, true)
      writeStr(8, 'WAVE')
      writeStr(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, 16000, true)
      view.setUint32(28, 32000, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      writeStr(36, 'data')
      view.setUint32(40, samples * 2, true)
      var off = 44
      for (var j = 0; j < samples; j++) {
        var s = clamp(float32[j], -1, 1)
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
        off += 2
      }
      return new Uint8Array(view.buffer)
    }

    function bytesToBase64(bytes) {
      var out = ''
      var CHUNK = 0x8000
      for (var i = 0; i < bytes.length; i += CHUNK) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
      }
      return window.btoa(out)
    }

    /* ------------------------------------------------------------------ */
    /* 播放器：把 sentence 事件里的 MP3 排队播出来                          */
    /* ------------------------------------------------------------------ */
    function createPlayer(ac, store, hooks) {
      var queue = []
      var pre = Object.create(null)
      var playing = null
      var generation = 0

      function fetchAudio(url) {
        return fetch(url, { headers: { accept: 'audio/mpeg' } }).then(function (r) {
          if (!r.ok) throw new Error('audio ' + r.status)
          return r.arrayBuffer()
        })
      }

      function prefetch(item) {
        if (!item || pre[item.id]) return
        fetchAudio(item.url).then(function (ab) { pre[item.id] = ab }).catch(function () {})
      }

      function pump() {
        if (playing) return
        var item = queue.shift()
        if (!item) {
          store.set({ queueLen: 0, speaking: false })
          if (hooks.onDrained) { try { hooks.onDrained() } catch (e) {} }
          return
        }
        store.set({ queueLen: queue.length, speaking: true })
        var gen = generation
        var ready = pre[item.id] ? Promise.resolve(pre[item.id]) : fetchAudio(item.url)
        ready.then(function (ab) {
          delete pre[item.id]
          return ac.decodeAudioData(ab.slice(0))
        }).then(function (audio) {
          if (gen !== generation) return
          if (queue[0]) prefetch(queue[0])
          var src = ac.createBufferSource()
          src.buffer = audio
          var gain = ac.createGain()
          gain.gain.value = 1
          src.connect(gain)
          gain.connect(ac.destination)
          playing = { src: src, gain: gain }
          src.onended = function () {
            if (playing && playing.src === src) { playing = null; pump() }
          }
          try { src.start(0) } catch (e) { playing = null; pump() }
          if (hooks.onStart) { try { hooks.onStart(item) } catch (e) {} }
        }).catch(function () {
          if (gen === generation) { playing = null; store.set({ fallback: true }); pump() }
        })
      }

      function enqueue(item) {
        if (!item || !item.url) return
        queue.push(item)
        store.set({ queueLen: queue.length })
        prefetch(item)
        pump()
      }

      function duckTo(level) {
        if (!playing) return
        try {
          var g = playing.gain.gain
          var at = ac.currentTime
          var target = Math.max(0.0001, Math.min(1, Number(level) || 0.0001))
          g.cancelScheduledValues(at)
          g.setValueAtTime(g.value, at)
          g.linearRampToValueAtTime(target, at + 0.08)
        } catch (e) {}
      }

      function duck() { duckTo(0.0001) }

      function stopAll() {
        generation++
        queue = []
        pre = Object.create(null)
        store.set({ queueLen: 0, speaking: false })
        if (playing) {
          var p = playing
          playing = null
          try { p.src.onended = null; p.src.stop(0) } catch (e) {}
        }
      }

      return { enqueue: enqueue, stopAll: stopAll, duck: duck, duckTo: duckTo, isSpeaking: function () { return !!playing }, size: function () { return queue.length } }
    }

    /* ------------------------------------------------------------------ */
    /* 麦克风 + 能量 VAD + 切片 → 16k WAV                                 */
    /* ------------------------------------------------------------------ */
    function createMic(ac, store, opts) {
      var stream = null
      var srcNode = null
      var proc = null
      var sink = null
      var nativeRate = ac.sampleRate || 48000
      var SUB = 1024
      var MAX_SECONDS = 70
      var ring = []
      var ringStart = 0
      var ringEnd = 0
      var speaking = false
      var speechRun = 0
      var utterStart = 0
      var utterVoicedMs = 0
      var silenceMs = 0
      var lastVoicedAt = 0
      var noiseFloor = 0.006
      var ambient = 0.012
      var disposed = false
      var lastLevelAt = 0

      function rmsOf(buf, off, count) {
        var sum = 0
        for (var i = 0; i < count; i++) { var v = buf[off + i] || 0; sum += v * v }
        return Math.sqrt(sum / count)
      }

      function resetSpeech() { speaking = false; speechRun = 0; utterVoicedMs = 0; silenceMs = 0 }

      function sliceRing(start, end) {
        var len = Math.max(0, end - start)
        var out = new Float32Array(len)
        var cursor = ringStart
        var write = 0
        for (var i = 0; i < ring.length && write < len; i++) {
          var blk = ring[i]
          var blkStart = cursor
          var blkEnd = cursor + blk.length
          cursor = blkEnd
          if (blkEnd <= start) continue
          if (blkStart >= end) break
          var from = Math.max(start, blkStart) - blkStart
          var to = Math.min(end, blkEnd) - blkStart
          out.set(blk.subarray(from, to), write)
          write += to - from
        }
        return write === len ? out : out.subarray(0, write)
      }

      function emit(start, end) {
        var raw = sliceRing(start, end)
        if (raw.length < 1600) return
        var f32 = resampleTo16k(raw, nativeRate)
        var peak = 0
        for (var i = 0; i < f32.length; i++) { var a = Math.abs(f32[i]); if (a > peak) peak = a }
        if (peak > 0.001 && peak < 0.5) {
          var g = Math.min(6, 0.85 / peak)
          for (var j = 0; j < f32.length; j++) f32[j] = clamp(f32[j] * g, -1, 1)
        }
        var seconds = f32.length / 16000
        if (seconds < 0.2) return
        var wav = encodeWav16k(f32)
        if (opts.onUtterance) opts.onUtterance(bytesToBase64(wav), Math.round(seconds * 1000))
      }

      function step(rms, subMs, settings) {
        var now = Date.now()
        var mutedNow = !!(opts.isMuted && opts.isMuted())
        if (mutedNow) {
          if (now - lastLevelAt > 60) {
            lastLevelAt = now
            store.set({ level: 0 })
          }
          if (speaking) resetSpeech()
          return
        }
        if (now - lastLevelAt > 60) {
          lastLevelAt = now
          store.set({ level: clamp(rms * 9, 0, 1) })
        }
        var sens = settings.sensitivity === undefined || settings.sensitivity === null ? 0.5 : Number(settings.sensitivity)
        var mult = 2.6 - 1.5 * clamp(sens, 0, 1)
        /* 环境自适应：ambient 是「当前环境响度」的慢速跟随，用来在嘈杂房间抬高起点阈值；
           说话期间用更低的 stopThr 判尾音，形成迟滞，避免句子中间被切成两段。 */
        ambient = clamp(ambient * 0.985 + rms * 0.015, 0.001, 0.09)
        var startThr = Math.max(0.007, noiseFloor * mult, ambient * 1.35)
        var stopThr = Math.max(0.004, noiseFloor * mult * 0.55)
        var thr = startThr
        var assistantSpeaking = opts.isAssistantSpeaking()
        var bargeFast = false
        if (assistantSpeaking) {
          if (settings.bargeIn === false) { if (speaking) resetSpeech(); return }
          // 打断要快：明显高于环境噪声时，第一帧就判定为开口
          bargeFast = rms > Math.max(0.02, ambient * 2.2)
          if (!speaking && (bargeFast || rms > startThr * 1.45) && opts.onBargeHint) { try { opts.onBargeHint() } catch (e) {} }
        }
        if (opts.isMuted()) { if (speaking) resetSpeech(); return }

        if (!speaking) {
          if (rms > startThr) speechRun++
          else {
            speechRun = 0
            noiseFloor = clamp(noiseFloor * 0.94 + rms * 0.06, 0.0012, 0.045)
          }
          if (speechRun >= (assistantSpeaking ? (bargeFast ? 1 : 2) : 3)) {
            speaking = true
            utterStart = ringEnd - (speechRun + 12) * SUB
            if (utterStart < ringStart) utterStart = ringStart
            utterVoicedMs = 0
            silenceMs = 0
            lastVoicedAt = ringEnd
            if (opts.onSpeechStart) { try { opts.onSpeechStart() } catch (e) {} }
          }
          return
        }

        utterVoicedMs += subMs
        if (rms > stopThr) { silenceMs = 0; lastVoicedAt = ringEnd } else silenceMs += subMs
        var silenceTarget = settings.silenceMs === undefined ? 900 : Number(settings.silenceMs)
        var maxMs = settings.maxUtteranceMs === undefined ? 30000 : Number(settings.maxUtteranceMs)
        if (silenceMs >= silenceTarget || utterVoicedMs >= maxMs) {
          var end = lastVoicedAt
          var start = utterStart
          var minSamples = ((settings.minSpeechMs === undefined ? 250 : Number(settings.minSpeechMs)) / 1000) * nativeRate
          resetSpeech()
          if (end - start >= minSamples) emit(start, end)
          else if (opts.onTooShort) { try { opts.onTooShort() } catch (e) {} }
        }
      }

      function onAudio(e) {
        if (disposed) return
        var input = e.inputBuffer.getChannelData(0)
        var copy = new Float32Array(input.length)
        copy.set(input)
        ring.push(copy)
        ringEnd += copy.length
        var maxSamples = MAX_SECONDS * nativeRate
        while (ringEnd - ringStart > maxSamples && ring.length > 1) ringStart += ring.shift().length
        var settings = opts.getSettings() || {}
        var subMs = (SUB / nativeRate) * 1000
        for (var off = 0; off + SUB <= copy.length; off += SUB) {
          step(rmsOf(copy, off, SUB), subMs, settings)
        }
      }

      function detach() {
        if (proc) { proc.onaudioprocess = null; try { proc.disconnect() } catch (e) {} }
        if (srcNode) { try { srcNode.disconnect() } catch (e) {} }
        if (sink) { try { sink.disconnect() } catch (e) {} }
        if (stream) { try { stream.getTracks().forEach(function (tr) { try { tr.stop() } catch (e) {} }) } catch (e) {} }
        proc = null; srcNode = null; sink = null; stream = null
      }

      function attach(s) {
        stream = s
        srcNode = ac.createMediaStreamSource(s)
        var Ctor = ac.createScriptProcessor || ac.createJavaScriptNode
        proc = Ctor.call(ac, 4096, 1, 1)
        proc.onaudioprocess = onAudio
        srcNode.connect(proc)
        sink = ac.createGain()
        sink.gain.value = 0
        proc.connect(sink)
        sink.connect(ac.destination)
        return true
      }

      function acquire() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          return Promise.reject(new Error('getUserMedia unavailable'))
        }
        return navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false
        }).then(function (s) {
          if (disposed) { s.getTracks().forEach(function (tr) { try { tr.stop() } catch (e) {} }); return false }
          return attach(s)
        })
      }

      function start() {
        return acquire()
      }

      /* 麦克风自愈：丢掉旧流、重新取一次（切设备/系统休眠后常见） */
      function restart() {
        if (disposed) return Promise.resolve(false)
        detach()
        resetSpeech()
        return acquire()
      }

      function health() {
        var track = null
        try { track = stream && stream.getAudioTracks ? stream.getAudioTracks()[0] : null } catch (e) {}
        return {
          acState: ac.state,
          track: track ? track.readyState : 'none',
          muted: track ? !!track.muted : true
        }
      }

      function dispose() {
        if (disposed) return
        disposed = true
        resetSpeech()
        detach()
        ring = []
      }

      return { start: start, restart: restart, health: health, dispose: dispose }
    }

    /* ------------------------------------------------------------------ */
    /* 控制器：通话生命周期 / SSE / ASR / 发送 / 打断                       */
    /* ------------------------------------------------------------------ */
    var INITIAL = {
      call: false, connecting: false, sessionId: null, chatSessionId: null, voiceSessionId: null,
      phase: 'idle', booted: false, needsGesture: false, unread: 0,
      activeTabId: null, otherTab: false, level: 0, queueLen: 0, speaking: false, askPending: null,
      lines: [], partial: '', settings: null, voices: [], asr: null, tts: null,
      lastError: '', micMuted: false, showSettings: false, fallback: false, orbExpanded: false, orbEdge: null, orbManual: false, orbWantHide: 0, fanOpen: false,
      panelOpen: false, panelPos: { x: 0, y: 0 },
      recordsOpen: false, recordsList: [], recordsLoading: false, recordsDetail: null,
      recordsError: '', recordsFilter: '', recordsPlaying: null,
      delegations: [], delegationHistory: [], smokeReport: '', busyOwner: '', recordsHits: [],
    }

    var TRANSCRIPT_KEY = 'dsh-voice-companion:transcript:v1'
    var ORB_POS_KEY = 'dsh-voice-companion:orb:v1'
    var WANT_KEY = 'dsh-voice-companion:wantcall:v1'
    var CLIENT_BUILD = 'v62'

    function stripOk(obj) {
      if (!obj || typeof obj !== 'object') return {}
      var out = {}
      for (var k in obj) if (k !== 'ok' && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k]
      return out
    }

    function createController(ctx, store) {
      var cur = null
      var inputActions = null

      function parse(ev) {
        try { return JSON.parse(ev.data) } catch (e) { return null }
      }

      var sessionRefs = new Map()
      var sessionMap = new Map()
      var thinkingTimer = null

      function dbg(tag, data) {
        try { void api('/debug', { method: 'POST', body: { tag: tag, data: data === undefined ? null : data } }) } catch (e) {}
      }

      /* 客户端 Service 取用：优先 ctx.sessions，再退回 ctx.get('sessions')，
         注入未生效时也不会让整条发送链静默失败。 */
      function sessionsService() {
        try {
          var direct = ctx && ctx.sessions
          if (direct && typeof direct.binding === 'function') return direct
        } catch (e) {}
        try {
          var viaGet = ctx && typeof ctx.get === 'function' ? ctx.get('sessions') : null
          if (viaGet && typeof viaGet.binding === 'function') return viaGet
          if (viaGet && typeof viaGet.retain === 'function') return viaGet
        } catch (e) {}
        return null
      }

      function bindingOf(sessionId) {
        try {
          var ss = sessionsService()
          if (!ss || typeof ss.binding !== 'function') return null
          return ss.binding(sessionId) || null
        } catch (e) { return null }
      }

      function getSession(sessionId) {
        if (!sessionId) return null
        var b = bindingOf(sessionId)
        if (b && b.session) { sessionMap.set(sessionId, b.session); return b.session }
        return sessionMap.get(sessionId) || null
      }

      /* ctx.sessions.binding(id) 只对已 materialize 的 scope 有值；
         面板自己 retain 一次，才能拿到可用的 ISession（prompt/cancel）。 */
      async function ensureSession(sessionId) {
        if (!sessionId) { dbg('ensure-session', { sessionId: sessionId, why: 'no-session-id' }); return null }
        var found = getSession(sessionId)
        if (found) return found
        var ss = sessionsService()
        if (!ss || typeof ss.retain !== 'function') {
          dbg('ensure-session', { sessionId: sessionId, why: 'no-retain-api', hasSessions: !!ss })
          return null
        }
        var ref = sessionRefs.get(sessionId)
        if (!ref) {
          try { ref = ss.retain(sessionId, { source: 'gateway' }) } catch (e) {
            dbg('ensure-session', { sessionId: sessionId, why: 'retain-threw', error: String((e && e.message) || e) })
            return null
          }
          if (!ref) { dbg('ensure-session', { sessionId: sessionId, why: 'retain-null' }); return null }
          sessionRefs.set(sessionId, ref)
        }
        var readyValue = await withTimeout(ref.ready, 6000, 'retain-ready')
        if (readyValue === null) { dbg('ensure-session', { sessionId: sessionId, why: 'ready-timeout' }); return null }
        var binding = null
        try { binding = ref.binding } catch (e) { binding = null }
        var session = (binding && binding.session) || null
        if (session) sessionMap.set(sessionId, session)
        dbg('ensure-session', { sessionId: sessionId, why: session ? 'ok' : 'no-session-on-binding', hasBinding: !!binding })
        return session
      }

      function releaseSessions() {
        sessionRefs.forEach(function (ref) {
          try { if (ref && typeof ref.release === 'function') ref.release() } catch (e) {}
        })
        sessionRefs.clear()
        sessionMap.clear()
      }

      function persistLines(lines) {
        try {
          var tail = lines.slice(Math.max(0, lines.length - 40))
          window.localStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(tail))
        } catch (e) {}
      }

      function loadLines() {
        try {
          var raw = window.localStorage.getItem(TRANSCRIPT_KEY)
          if (!raw) return []
          var arr = JSON.parse(raw)
          return Array.isArray(arr) ? arr.slice(-40) : []
        } catch (e) { return [] }
      }

      function pushLine(line) {
        store.set(function (s) {
          var lines = s.lines.concat([line])
          if (lines.length > 60) lines = lines.slice(lines.length - 60)
          persistLines(lines)
          return Object.assign({}, s, { lines: lines })
        })
        if (line && line.text && (line.role === 'user' || line.role === 'assistant')) {
          postRecord({ role: line.role, text: line.text, at: line.at || Date.now() })
        }
      }

      /* 语音记录：Host 侧按会话落盘，这里只负责把每一句追加进去。 */
      function postRecord(entry) {
        var sid = store.get().voiceSessionId || (cur && cur.sessionId) || null
        if (!sid) return
        try {
          void api('/records', { method: 'POST', body: { sessionId: String(sid), entry: entry } })
        } catch (e) {}
      }

      function insertDraft(text) {
        try {
          if (!inputActions) return false
          var span = typeof inputActions.captureInsertion === 'function' ? inputActions.captureInsertion() : undefined
          if (typeof inputActions.insertText !== 'function') return false
          return !!inputActions.insertText(text, span)
        } catch (e) { return false }
      }

      function applyState(s) {
        /* 多窗口：不是当前持有通话的窗口 → 标记并在本地静默退场 */
        try {
          var elsewhere = !!(s && s.enabled && s.activeTabId && TAB_ID && String(s.activeTabId) !== String(TAB_ID))
          if (elsewhere && cur) stopLocalOnly('已在另一个窗口通话，本窗口已退出')
          if (s && typeof s === 'object') s = Object.assign({}, s, { busyElsewhere: elsewhere })
        } catch (e) {}
        if (!s || typeof s !== 'object') return
        var patch = {}
        if (s.phase) patch.phase = s.phase
        if ('activeTabId' in s) {
          patch.activeTabId = s.activeTabId
          patch.otherTab = !!s.activeTabId && s.activeTabId !== TAB_ID
        }
        if (s.asr) patch.asr = s.asr
        if (s.tts) patch.tts = s.tts
        if (s.enabled === false && cur && s.activeTabId && s.activeTabId !== TAB_ID) patch.otherTab = true
        if (s.speaking !== undefined) patch.speaking = !!s.speaking
        if (s.settings && typeof s.settings === 'object') {
          patch.settings = s.settings
          if (cur) cur.settings = s.settings
        }
        if (s.voiceSessionId && s.voiceSessionId !== store.get().voiceSessionId) {
          patch.voiceSessionId = s.voiceSessionId
          patch.sessionId = s.voiceSessionId
        }
        if (s.queue !== undefined) patch.queueLen = s.queue
        store.set(patch)
        // 宿主半被重载（插件重新启用/进程重启）后通话注册会丢失，这里自动补一次 /start
        if (s.enabled === false && cur && !s.sessionId) reRegister()
      }

      function reRegister() {
        if (!cur || cur.reRegistering) return
        var sid = store.get().voiceSessionId || cur.sessionId
        if (!sid) return
        cur.reRegistering = true
        dbg('reregister', { sessionId: sid })
        api('/start', { method: 'POST', body: { sessionId: store.get().chatSessionId || null, tabId: TAB_ID } }).then(function (r) {
          if (cur) cur.reRegistering = false
          if (r && r.ok !== false) {
            if (r.voiceSessionId) {
              store.set({ voiceSessionId: r.voiceSessionId, sessionId: r.voiceSessionId })
              if (cur) cur.sessionId = r.voiceSessionId
            }
            resetToListening()
          }
        }).catch(function () { if (cur) cur.reRegistering = false })
      }

      function setPhase(phase) {
        if (store.get().phase !== phase) store.set({ phase: phase })
      }

      function resetToListening() {
        clearThinkingWatchdog()
        setPhase('listening')
      }

      /* 助手长时间没有任何 turn 事件（宿主半掉线、回合没起来）时，不能永远停在思考中。 */
      function armThinkingWatchdog(ms) {
        clearThinkingWatchdog()
        thinkingTimer = setTimeout(function () {
          thinkingTimer = null
          if (!cur || store.get().phase !== 'thinking') return
          dbg('thinking-timeout', {})
          store.set({ lastError: t('thinkingTimeout') })
          resetToListening()
        }, ms || 75000)
      }

      function clearThinkingWatchdog() {
        if (thinkingTimer) { clearTimeout(thinkingTimer); thinkingTimer = null }
      }

      var seenSentences = Object.create(null)
      var seenCount = 0
      var esRef = null
      var lastWakeAt = 0
      var spokenTexts = []
      var spokenAt = 0

      function pushSpoken(text) {
        var norm = normalizeSpeech(text)
        if (!norm) return
        spokenTexts.push({ norm: norm, at: Date.now() })
        spokenAt = Date.now()
        if (spokenTexts.length > 4) spokenTexts.shift()
      }

      /* 回声过滤：刚念过的内容又被识别回来，就当成自己的回声丢掉 */
      function looksLikeEcho(text) {
        var norm = normalizeSpeech(text)
        if (norm.length < 4) return false
        if (Date.now() - spokenAt > 9000) return false
        for (var i = spokenTexts.length - 1; i >= 0; i -= 1) {
          var s = spokenTexts[i].norm
          if (s.length < 4) continue
          if (s.indexOf(norm) >= 0 && norm.length >= Math.min(6, s.length)) return true
          if (norm.indexOf(s) >= 0 && s.length >= 6) return true
          // 前后各取 6 个字符比对，覆盖 ASR 只识别出半句的情况
          if (norm.length >= 6 && s.indexOf(norm.slice(0, 6)) === 0) return true
        }
        return false
      }

      function markSentence(id) {
        if (!id) return false
        if (seenSentences[id]) return true
        seenSentences[id] = 1
        seenCount += 1
        if (seenCount > 400) { seenSentences = Object.create(null); seenCount = 0 }
        return false
      }

      function openEvents() {
        // 同一页面只允许一条 SSE：开新连接前先关掉旧的，避免同一条回复被投递两次
        if (esRef) {
          try { esRef.close() } catch (e) {}
          esRef = null
        }
        var es
        try { es = new EventSource(BASE + '/events?tabId=' + encodeURIComponent(TAB_ID)) } catch (e) { return null }
        function on(name, fn) { es.addEventListener(name, function (ev) { try { fn(parse(ev)) } catch (e) {} }) }
        on('hello', function (d) { applyState(d && d.state ? d.state : d) })
        on('delegate', function (d) {
          void refreshDelegations()
          if (d && d.id) {
            var nm = d.ok === false ? t('delegFail') : t('delegDone')
            pushLine('assistant', '✔ ' + nm + ' #' + d.id + (d.digest ? '：' + String(d.digest).slice(0, 60) : ''))
          }
        })
        on('smoke', function (d) { void runSmoke(d && d.id) })
        on('state', function (d) { applyState(d && d.state ? d.state : d) })
        on('turn', function (d) {
          if (!d) return
          clearThinkingWatchdog()
          if (d.phase === 'thinking') setPhase('thinking')
          else if (d.phase === 'speaking') setPhase('speaking')
          else if (d.phase === 'done') { if (!store.get().speaking) resetToListening() }
          if (typeof d.turn === 'number' && cur) {
            if (cur.turn !== d.turn) { cur.turn = d.turn; store.set({ partial: '' }) }
          }
        })
        on('delta', function (d) {
          if (!d || !d.text) return
          clearThinkingWatchdog()
          store.set(function (s) { return Object.assign({}, s, { partial: (s.partial || '') + d.text, phase: 'thinking' }) })
        })
        on('sentence', function (d) {
          if (!d || !d.url) return
          if (markSentence(d.id)) return
          if (d.text) pushSpoken(d.text)
          if (cur) {
            cur.player.enqueue({ id: d.id, url: d.url, text: d.text, index: d.index, turn: d.turn })
            setPhase('speaking')
            if (d.text) pushLine({ role: 'assistant', text: d.text, at: Date.now() })
            store.set({ partial: '' })
          }
        })
        on('speech-end', function () { if (!store.get().speaking) resetToListening() })
        on('tool', function (d) { if (d && d.name) pushLine({ role: 'tool', text: '🛠 ' + d.name, at: Date.now() }) })
        on('transcript', function (d) { if (d && d.text && d.source !== 'asr') pushLine({ role: 'user', text: d.text, at: Date.now() }) })
        on('asr', function (d) { if (d) store.set({ asr: d }) })
        on('ui', function (d) { if (d && d.kind) void runUiDirective(d) })
        on('ask', function (d) {
          if (!d || !d.id) return
          if (d.status === 'closed' || d.status === 'answered') {
            if (store.get().askPending) store.set({ askPending: null })
            return
          }
          store.set({ askPending: { id: d.id, question: String(d.question || ''), options: d.options || [] } })
          store.set({ panelOpen: true, unread: 0, orbExpanded: true, orbManual: true })
          pushLine({ role: 'tool', text: '❓ ' + String(d.question || ''), at: Date.now() })
          reportTag('ask-open', { id: d.id })
        })
        on('error', function (d) { if (d && d.message) store.set({ lastError: String(d.message) }) })
        es.addEventListener('error', function () {
          if (es.readyState === 2) {
            setTimeout(function () {
              if (esRef !== es) return
              try { es.close() } catch (e) {}
              dbg('sse-reopen', {})
              api('/state').then(function (s) { if (s && s.ok !== false) applyState(s) }).catch(function () {})
              var next = openEvents()
              esRef = next
              if (cur) cur.es = next
            }, 1200)
          }
        })
        esRef = es
        return es
      }

      /* 任何 await 都不能把整条语音链挂死：超时即当失败，交给下一级兜底。 */
      /* ------------------------------------------------------------------ */
      /* UI 指令通道：Host 要求「真的把界面切过去」，浏览器端负责执行并回执     */
      /* ------------------------------------------------------------------ */
      function serviceOf(name) {
        try { return ctx.get(name) } catch (e) { return null }
      }

      /* 只在「侧栏底部」找 DSH 自己的设置入口：
         绝不能点到语音面板/记录页里的任何按钮（这是上次点错的根因）。 */
      function clickSettingsButton() {
        try {
          var nodes = document.querySelectorAll('button, [role="button"], a[role="button"]')
          var best = null
          var bestScore = -1
          for (var i = 0; i < nodes.length; i += 1) {
            var node = nodes[i]
            if (!node || typeof node.click !== 'function') continue
            if (node.closest && node.closest('.vc-panel, .vc-modal, .vc-dock, .vc-page, [data-vc]')) continue
            if (node.disabled || node.getAttribute('aria-disabled') === 'true') continue
            var label = String(node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').trim()
            if (!label || label.length > 24) continue
            if (!(/^设置$/.test(label) || /^(settings|preferences|设置与偏好|偏好设置)$/i.test(label))) continue
            var score = 0
            if (node.closest && node.closest('[class*="sidebar"], aside, nav')) score += 3
            var rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null
            if (rect && rect.width > 0 && rect.height > 0) score += 1
            if (rect && rect.left < window.innerWidth * 0.5) score += 2
            if (score > bestScore) { bestScore = score; best = node }
          }
          if (best) { best.click(); return true }
        } catch (e) {}
        return false
      }

      var PANEL_ALIAS = {
        chat: 'chat', conversation: 'chat', '对话': 'chat',
        sidebar: 'sidebar', '侧边栏': 'sidebar', side: 'sidebar',
        settings: 'settings', '设置': 'settings',
        records: 'voice-records', 'voice-records': 'voice-records', '语音记录': 'voice-records',
        plugins: 'plugins', '插件': 'plugins',
        schedules: 'schedules', '定时': 'schedules',
        'dsh-context': 'dsh-context', context: 'dsh-context', '上下文': 'dsh-context',
        mnemon: 'mnemon', '记忆': 'mnemon',
        'mcp-connector': 'mcp-connector', mcp: 'mcp-connector',
        video: 'video', '影视': 'video',
        novel: '@xrn1997/dsh-novel.panel', '小说': '@xrn1997/dsh-novel.panel',
        '@xrn1997/dsh-novel.panel': '@xrn1997/dsh-novel.panel'
      }

      async function runUiDirective(d) {
        var result = { ok: false, code: 'unsupported', message: '不认识的界面指令' }
        try {
          var payload = (d && d.payload) || {}
          var kind = String(d && d.kind || '')
          if (kind === 'session.open') {
            var ws = serviceOf('uiWorkspace')
            if (!ws || typeof ws.openSession !== 'function') throw new Error('uiWorkspace 服务不可用')
            ws.openSession(payload.sessionId)
            result = { ok: true, message: '已打开对话' }
          } else if (kind === 'session.send') {
            var targetSession = payload.sessionId || store.get().chatSessionId || null
            if (!targetSession) throw new Error('没有可发送的会话')
            var sent = await promptSession(targetSession, String(payload.text || ''))
            result = sent ? { ok: true, message: '已发送' } : { ok: false, code: 'send-failed', message: '发送失败' }
          } else if (kind === 'session.new') {
            var wsNew = serviceOf('uiWorkspace')
            if (!wsNew || typeof wsNew.startSession !== 'function') throw new Error('uiWorkspace 服务不可用')
            var newId = await wsNew.startSession(payload.workspaceId || undefined)
            if (newId && typeof wsNew.openSession === 'function') { try { wsNew.openSession(newId) } catch (e) {} }
            result = { ok: true, sessionId: newId || null, message: '已新建对话' }
          } else if (kind === 'session.archive') {
            var wsArc = serviceOf('uiWorkspace')
            if (!wsArc || typeof wsArc.archiveSession !== 'function') throw new Error('uiWorkspace 服务不可用')
            await wsArc.archiveSession(payload.sessionId)
            result = { ok: true, message: '已归档' }
          } else if (kind === 'session.rename') {
            var target = String(payload.sessionId || '')
            if (!target) throw new Error('缺少 sessionId')
            var renamed = await ensureSession(target)
            if (!renamed || typeof renamed.rename !== 'function') throw new Error('拿不到该会话')
            await renamed.rename(String(payload.title || '未命名对话'))
            result = { ok: true, message: '已重命名' }
          } else if (kind === 'workspace.open') {
            var ws2 = serviceOf('uiWorkspace')
            if (!ws2 || typeof ws2.openWorkspace !== 'function') throw new Error('uiWorkspace 服务不可用')
            if (payload.workspaceId) await ws2.openWorkspace(payload.workspaceId)
            else if (payload.path) await ws2.connectWorkspace(payload.path)
            else throw new Error('缺少工作区参数')
            result = { ok: true, message: '已切换工作区' }
          } else if (kind === 'panel.open') {
            var layout = serviceOf('layout')
            var raw = payload.panel == null ? 'chat' : String(payload.panel)
            var panel = PANEL_ALIAS[raw]
            if (!panel) throw new Error('不认识的面板：' + raw)
            if (panel === 'sidebar') {
              if (!layout || typeof layout.toggleSidebar !== 'function') throw new Error('layout 服务不可用')
              layout.toggleSidebar()
              result = { ok: true, message: '已切换侧栏' }
            } else if (panel === 'settings') {
              result = clickSettingsButton()
                ? { ok: true, message: '已打开设置' }
                : { ok: false, code: 'settings-unavailable', message: '这个界面里找不到设置入口' }
            } else if (panel === 'chat') {
              if (!layout || typeof layout.selectPanel !== 'function') throw new Error('layout 服务不可用')
              layout.selectPanel(null)
              result = { ok: true, message: '已回到对话' }
            } else {
              if (!layout || typeof layout.selectPanel !== 'function') throw new Error('layout 服务不可用')
              layout.selectPanel(panel)
              result = { ok: true, message: '已切换界面' }
            }
          } else if (kind === 'records.open') {
            var layoutR = serviceOf('layout')
            if (!layoutR || typeof layoutR.selectPanel !== 'function') throw new Error('layout 服务不可用')
            layoutR.selectPanel('voice-records')
            result = { ok: true, message: '已打开语音记录' }
          } else if (kind === 'toast') {
            pushLine({ role: 'tool', text: 'ℹ ' + String(payload.text || ''), at: Date.now() })
            result = { ok: true, message: '已提示' }
          }
        } catch (e) {
          result = { ok: false, code: 'ui-failed', message: String((e && e.message) || e) }
        }
        try { await api('/ui-ack', { method: 'POST', body: { id: d && d.id, result: result } }) } catch (e) {}
      }

      /* ------------------------------------------------------------------ */
      /* 语音记录：列表 / 详情 / 试听 / 删除 / 清空 / 导出                     */
      /* ------------------------------------------------------------------ */
      async function requestTopicTitle(sessionId) {
        if (!sessionId) return
        try {
          var r = await api('/records/' + encodeURIComponent(sessionId) + '/title', { method: 'POST', body: { auto: true } })
          if (r && r.ok && r.title) await refreshRecords()
        } catch (e) {}
      }

      async function refreshRecords() {
        store.set({ recordsLoading: true, recordsError: '' })
        try {
          var r = await api('/records')
          if (r && r.ok === false) {
            store.set({ recordsLoading: false, recordsError: String(r.message || r.code || '读取失败') })
            return
          }
          store.set({ recordsLoading: false, recordsList: Array.isArray(r.items) ? r.items : [] })
        } catch (e) {
          store.set({ recordsLoading: false, recordsError: String((e && e.message) || e) })
        }
      }

      /* 页面内自检：在真实页面里跑一遍关键交互，结果回传宿主 */
      async function runSmoke(id) {
        var checks = []
        var before = store.get()
        function add(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 140) }) }
        function q(sel) { try { return document.querySelector(sel) } catch (e) { return null } }
        function count(sel) { try { return document.querySelectorAll(sel).length } catch (e) { return 0 } }
        function tap(el) {
          if (!el) return
          var b = null
          try { b = el.getBoundingClientRect() } catch (e) {}
          var x = b ? Math.round(b.left + b.width / 2) : 0
          var y = b ? Math.round(b.top + b.height / 2) : 0
          var base = { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y }
          try { el.dispatchEvent(new PointerEvent('pointerdown', base)) } catch (e) { el.dispatchEvent(new MouseEvent('pointerdown', base)) }
          try { el.dispatchEvent(new PointerEvent('pointerup', base)) } catch (e) { el.dispatchEvent(new MouseEvent('pointerup', base)) }
        }
        try {
          add('运行时已就绪', !!runtime && !!runtime.ctrl, CLIENT_BUILD)
          add('悬浮球已挂载', !!q('.vc-dock'), q('.vc-dock') ? 'ok' : 'missing')
          try {
            var dock0 = q('.vc-dock')
            add('dock 结构', !!dock0, dock0
              ? ('cls=' + String(dock0.className || '') + ' body=' + count('.vc-dock-body') + ' stack=' + count('.vc-dock-stack') + ' orb=' + count('.vc-dock-orb') + ' tab=' + count('.vc-dock-tab') + ' exp=' + String(store.get().orbExpanded) + ' fan=' + String(store.get().fanOpen))
              : 'missing')
          } catch (e0) { add('dock 结构', false, String(e0 && e0.message)) }
          try { runtime.ctrl.revealOrb() } catch (e) {}
          await delay(240)
          var orb = q('button.vc-dock-orb')
          add('悬浮球可展开', !!orb && !!store.get().orbExpanded, 'exp=' + String(store.get().orbExpanded) + ' orb=' + count('.vc-dock-orb'))
          if (orb) {
            tap(orb)
            await delay(320)
            add('扇出三个入口', count('.vc-fan-btn') === 3, count('.vc-fan-btn') + ' buttons')
            tap(orb)
            await delay(240)
            add('再点收起扇出', count('.vc-fan-btn') === 0, count('.vc-fan-btn') + ' buttons')
          } else {
            add('扇出三个入口', false, 'no orb')
            add('再点收起扇出', false, 'no orb')
          }
          runtime.ctrl.openPanel(true)
          await delay(260)
          add('通话卡片可打开', !!q('.vc-panel'), q('.vc-panel') ? 'ok' : 'missing')
          runtime.ctrl.openRecords()
          await delay(800)
          add('记录面板可打开', !!q('.vc-sheet'), q('.vc-sheet') ? 'ok' : 'missing')
          add('记录面板有内容区', (count('.vc-rec-list') + count('.vc-rec-detail')) > 0, 'list=' + count('.vc-rec-list') + ' detail=' + count('.vc-rec-detail'))
          try {
            runtime.ctrl.toggleSettings()
            await delay(140)
            add('设置面板可打开', !!q('.vc-settings'), 'settings=' + count('.vc-settings'))
            runtime.ctrl.toggleSettings()
            await delay(90)
          } catch (eS) { add('设置面板可打开', false, String((eS && eS.message) || eS)) }
          runtime.ctrl.closeRecords()
          await delay(160)
          add('状态模型可用', typeof statusOf === 'function' && !!statusOf(store.get()).key, statusOf(store.get()).label)
          var panelEl = q('.vc-panel')
          if (panelEl) { var cs = getComputedStyle(panelEl); add('主题背景已应用', !!cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)', cs.backgroundColor) }
          else add('主题背景已应用', false, 'no panel')
        } catch (e) { add('自检异常', false, (e && e.message) || e) }
        var failed = checks.filter(function (c) { return !c.ok }).length
        store.set({ smokeReport: (checks.length - failed) + '/' + checks.length + ' 通过' + (failed ? '（' + failed + ' 项失败）' : '') })
        try { await api('/smoke-result', { method: 'POST', body: { id: id || ('manual' + Date.now().toString(36)), checks: checks } }) } catch (e) {}
        try { if (!before.panelOpen) runtime.ctrl.openPanel(false) } catch (e) {}
        return { ok: failed === 0, failed: failed, total: checks.length }
      }

      /* 委托：面板里能看到「委托中 / 已完成」，并可取消 */
      async function refreshDelegations() {
        try {
          var r = await api('/delegations')
          store.set({
            delegations: r && Array.isArray(r.items) ? r.items : [],
            delegationHistory: r && Array.isArray(r.history) ? r.history : []
          })
        } catch (e) {}
      }

      async function retryDelegation(id) {
        if (!id) return
        try {
          var r = await api('/delegations/retry', { method: 'POST', body: { id: String(id) } })
          if (r && r.ok && r.id) pushLine('tool', '↻ 已重新派发 #' + r.id)
          else if (r && r.message) store.set({ lastError: String(r.message) })
        } catch (e) {}
        await refreshDelegations()
      }

      async function cancelDelegation(id) {
        if (!id) return
        try {
          await api('/delegations/cancel', { method: 'POST', body: { id: String(id) } })
        } catch (e) {}
        await refreshDelegations()
      }

      async function renameRecord(sessionId, title) {
        if (!sessionId || !title) return
        try {
          await api('/records/' + encodeURIComponent(sessionId) + '/title', { method: 'POST', body: { title: String(title) } })
        } catch (e) {}
        await refreshRecords()
        await openRecord(sessionId)
      }

      async function regenerateTitle(sessionId) {
        if (!sessionId) return
        try {
          await api('/records/' + encodeURIComponent(sessionId) + '/title', { method: 'POST', body: { regenerate: true } })
        } catch (e) {}
        await refreshRecords()
        await openRecord(sessionId)
      }

      async function openRecord(sessionId) {
        store.set({ recordsError: '' })
        try {
          var r = await api('/records/' + encodeURIComponent(sessionId) + '?limit=300')
          if (r && r.ok === false) {
            store.set({ recordsError: String(r.message || r.code || '读取失败') })
            return
          }
          var entries = Array.isArray(r.entries) ? r.entries : Array.isArray(r.items) ? r.items : []
          store.set({ recordsDetail: { sessionId: sessionId, entries: entries, startedAt: r.startedAt || null, count: r.count || entries.length } })
        } catch (e) {
          store.set({ recordsError: String((e && e.message) || e) })
        }
      }

      async function playRecordEntry(text) {
        var clean = String(text || '').trim()
        if (!clean) return
        store.set({ recordsPlaying: clean })
        try {
          var r = await api('/speak', { method: 'POST', body: { text: clean } })
          if (!r || !r.id) throw new Error((r && r.message) || '合成失败')
          var audio = new window.Audio(BASE + '/audio/' + encodeURIComponent(r.id))
          audio.onended = function () { store.set({ recordsPlaying: null }) }
          audio.onerror = function () { store.set({ recordsPlaying: null }) }
          await audio.play()
        } catch (e) {
          store.set({ recordsPlaying: null, recordsError: '试听失败：' + String((e && e.message) || e) })
        }
      }

      async function deleteRecordById(sessionId) {
        try {
          await api('/records/' + encodeURIComponent(sessionId) + '/delete', { method: 'POST', body: {} })
          var detail = store.get().recordsDetail
          if (detail && detail.sessionId === sessionId) store.set({ recordsDetail: null })
          await refreshRecords()
        } catch (e) {}
      }

      var searchTimer = null
      function globalSearch(q) {
        var text = String(q || '').trim()
        if (searchTimer) { clearTimeout(searchTimer); searchTimer = null }
        if (text.length < 2) { store.set({ recordsHits: [] }); return }
        searchTimer = setTimeout(async function () {
          searchTimer = null
          try {
            var r = await api('/records/search?q=' + encodeURIComponent(text))
            if (r && r.ok !== false) store.set({ recordsHits: r.items || [] })
          } catch (e) { /* 搜索失败不打断界面 */ }
        }, 320)
      }

      async function exportAllRecords() {
        try {
          var r = await api('/records/export')
          if (!r || r.ok === false || !r.markdown) { store.set({ recordsError: '导出失败' }); return }
          var blob = new Blob([r.markdown], { type: 'text/markdown;charset=utf-8' })
          var url = URL.createObjectURL(blob)
          var a = document.createElement('a')
          a.href = url
          a.download = 'voice-records-all.md'
          document.body.appendChild(a)
          a.click()
          setTimeout(function () { a.remove(); URL.revokeObjectURL(url) }, 1000)
          reportTag('export-all', { topics: r.topics })
        } catch (e) { store.set({ recordsError: '导出失败' }) }
      }

      async function clearAllRecords() {
        try {
          await api('/records/clear', { method: 'POST', body: {} })
          store.set({ recordsDetail: null })
          await refreshRecords()
        } catch (e) {}
      }

      async function exportRecordById(sessionId) {
        try {
          var r = await api('/records/' + encodeURIComponent(sessionId) + '/export')
          var text = (r && (r.markdown || r.text)) || ''
          if (!text) return
          var blob = new window.Blob([text], { type: 'text/markdown;charset=utf-8' })
          var url = window.URL.createObjectURL(blob)
          var a = document.createElement('a')
          a.href = url
          a.download = 'voice-record-' + sessionId.replace(/[^a-zA-Z0-9._-]/g, '_') + '.md'
          document.body.appendChild(a)
          a.click()
          setTimeout(function () { try { document.body.removeChild(a); window.URL.revokeObjectURL(url) } catch (e) {} }, 1000)
        } catch (e) {}
      }

      function withTimeout(promise, ms, label) {
        return new Promise(function (resolve) {
          var settled = false
          var timer = setTimeout(function () {
            if (settled) return
            settled = true
            dbg('timeout', { label: label, ms: ms })
            resolve(null)
          }, ms)
          Promise.resolve(promise).then(function (v) {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve(v === undefined ? true : v)
          }, function (e) {
            if (settled) return
            settled = true
            clearTimeout(timer)
            dbg('timeout-error', { label: label, error: String((e && e.message) || e) })
            resolve(null)
          })
        })
      }

      /* 立刻把草稿写进输入框并按下发送（等价于点发送按钮），不依赖 session binding。 */
      async function submitViaDraft(text) {
        try {
          if (!inputActions || typeof inputActions.setDraft !== 'function' || typeof inputActions.submit !== 'function') {
            dbg('submit-draft', { why: 'no-actions', hasInputActions: !!inputActions, keys: inputActions ? Object.keys(inputActions).slice(0, 14) : [] })
            return false
          }
          inputActions.setDraft(text)
          await delay(60)
          var p = inputActions.submit()
          if (p && typeof p.then === 'function') await withTimeout(p, 3000, 'draft-submit')
          dbg('submit-draft', { accepted: p !== false })
          return p !== false
        } catch (e) {
          dbg('submit-draft', { threw: String((e && e.message) || e) })
          return false
        }
      }

      async function promptSession(sessionId, text) {
        var s = sessionMap.get(sessionId) || getSession(sessionId)
        if (!s || typeof s.prompt !== 'function') {
          s = await withTimeout(ensureSession(sessionId), 5000, 'ensure-on-submit')
        }
        if (!s || typeof s.prompt !== 'function') {
          dbg('submit-prompt', { sessionId: sessionId, why: 'no-session' })
          return false
        }
        var running = false
        try { running = !!(s.getSnapshot && s.getSnapshot().running) } catch (e) {}
        var r = await withTimeout(s.prompt([{ type: 'text', text: text }], running ? 'steer' : 'queue'), 9000, 'prompt')
        dbg('submit-prompt', {
          sessionId: sessionId,
          mode: running ? 'steer' : 'queue',
          result: r === null ? 'timeout' : (r && r.ok === false ? 'rejected' : 'accepted')
        })
        return r !== null && !(r && r.ok === false)
      }

      async function submitText(chatSessionId, text) {
        if (!text) return false
        var voiceId = store.get().voiceSessionId
        var chatId = chatSessionId || store.get().chatSessionId
        dbg('submit-enter', { voiceId: voiceId, chatId: chatId })
        var targets = []
        if (voiceId) targets.push(voiceId)
        if (chatId && chatId !== voiceId) targets.push(chatId)
        for (var i = 0; i < targets.length; i += 1) {
          if (await promptSession(targets[i], text)) {
            dbg('submit', { via: 'prompt', target: targets[i] })
            return true
          }
        }
        dbg('submit', { via: 'draft' })
        if (await submitViaDraft(text)) return true
        var inserted = insertDraft(text)
        dbg('submit-insert', { inserted: inserted })
        return inserted
      }

      async function handleUtterance(wavBase64, durationMs) {
        if (!cur) return
        setPhase('thinking')
        store.set({ lastError: '', partial: '' })
        var r = await api('/asr', { method: 'POST', body: { wavBase64: wavBase64, durationMs: durationMs, language: (function () { var lg = (store.get().settings || {}).language || 'auto'; return lg === 'auto' ? undefined : lg })() } })
        if (!cur) return
        if (!r || r.ok === false) {
          var code = r && r.code
          if (code === 'not-ready') {
            store.set({ lastError: t('asrNotReady') })
            setTimeout(function () { if (cur) resetToListening() }, 1500)
          } else if (code === 'no-speech' || code === 'empty') {
            store.set({ lastError: t('noSpeech') })
            resetToListening()
          } else {
            store.set({ lastError: String((r && (r.message || code)) || 'asr failed') })
            resetToListening()
          }
          return
        }
        var text = String(r.text || '').replace(/\s+/g, ' ').trim()
        if (!text) { resetToListening(); return }
        var pendingAsk = store.get().askPending
        if (pendingAsk && pendingAsk.id) {
          var ansRes = await api('/ask/answer', { method: 'POST', body: { id: pendingAsk.id, text: text } })
          if (ansRes && ansRes.ok !== false) {
            pushLine({ role: 'user', text: text, at: Date.now() })
            store.set({ askPending: null })
            reportTag('ask-answer', { id: pendingAsk.id })
            resetToListening()
            return
          }
          if (ansRes && ansRes.code === 'not-found') store.set({ askPending: null })
        }
        try { if (cur) cur.lastUtterAt = Date.now() } catch (e) {}
        var s = cur.settings || {}
        if (looksLikeEcho(text)) {
          dbg('echo-skip', { text: text })
          resetToListening()
          return
        }
        if (s.requireWakeWord && s.wakeWord) {
          var wake = matchWake(text, s.wakeWord)
          if (!wake) { dbg('wake-miss', { text: text }); resetToListening(); return }
          text = wake.rest
          var nowTs = Date.now()
          if (!text && nowTs - lastWakeAt < 2500) { dbg('wake-repeat', { text: text }); resetToListening(); return }
          lastWakeAt = nowTs
          store.set({ panelOpen: true, unread: 0, orbExpanded: true, orbManual: true })
          chime()
          dbg('wake', { rest: text })
          if (!text) { resetToListening(); return }
        }
        pushLine({ role: 'user', text: text, at: Date.now() })
        dbg('asr-ok', { text: text, sessionId: cur.sessionId, autoSend: s.autoSend !== false })
        if (s.autoSend === false) {
          if (!insertDraft(text)) store.set({ lastError: t('manualSend') })
          resetToListening()
          return
        }
        var ok = await submitText(store.get().chatSessionId || cur.sessionId, text)
        if (!cur) return
        if (ok) armThinkingWatchdog()
        if (!ok) {
          insertDraft(text)
          store.set({ lastError: t('manualSend') })
          resetToListening()
        }
      }

      async function startCall(sessionId, opts) {
        dbg('start', { sessionId: sessionId, calling: !!cur })
        if (cur) await stopCall()
        store.set({ connecting: true, lastError: '', sessionId: sessionId })
        var settingsRes = await api('/settings')
        var settings = stripOk(settingsRes)
        var voicesRes = await api('/voices')
        var voices = (voicesRes && voicesRes.voices) || []
        var ac
        try {
          var Ctor = window.AudioContext || window.webkitAudioContext
          ac = new Ctor({ latencyHint: 'interactive' })
        } catch (e) {
          store.set({ connecting: false, lastError: 'AudioContext: ' + String(e && e.message) })
          return
        }
        try { await ac.resume() } catch (e) {}
        if (ac.state !== 'running') {
          try { ac.close() } catch (e) {}
          store.set({ connecting: false, needsGesture: true })
          dbg('need-gesture', { state: ac.state })
          armGestureStart()
          return false
        }
        var forceStart = !!(opts && opts.force)
        var started = await api('/start', { method: 'POST', body: { sessionId: sessionId || null, tabId: TAB_ID, force: forceStart } })
        if (started && started.ok === false && started.code === 'busy') {
          try { ac.close() } catch (e) {}
          store.set({ connecting: false, busyOwner: String(started.ownerTabId || 'other'), lastError: String(started.message || '已经在另一个窗口通话中') })
          return false
        }
        var voiceId = (started && started.voiceSessionId) || sessionId || null
        if (!started || started.ok === false) {
          try { ac.close() } catch (e) {}
          store.set({ connecting: false, lastError: String((started && (started.message || started.code)) || 'start failed') })
          return
        }
        cur = { sessionId: voiceId, chatSessionId: sessionId || null, ac: ac, settings: settings, player: null, mic: null, es: null, turn: -1, lastUtterAt: Date.now(), idleTimer: null }
        var token = cur
        cur.player = createPlayer(ac, store, {
          onDrained: function () {
            if (!store.get().speaking && cur === token) resetToListening()
          },
          onStart: function () { if (cur === token) setPhase('speaking') }
        })
        cur.mic = createMic(ac, store, {
          getSettings: function () { return (cur && cur.settings) || {} },
          isAssistantSpeaking: function () { return !!(cur && cur.player && cur.player.isSpeaking()) },
          isMuted: function () { return !!store.get().micMuted || !!store.get().otherTab },
          onSpeechStart: function () {
            if (!cur || cur !== token) return
            var s = cur.settings || {}
            if (s.bargeIn === false) {
              if (s.duckWhileSpeaking !== false && cur.player.isSpeaking()) {
                try { cur.player.duckTo(0.28) } catch (e) {}
              }
              return
            }
            if (cur.player.isSpeaking()) { interrupt(true) }
          },
          onUtterance: function (b64, ms) { if (cur === token) handleUtterance(b64, ms) },
          onTooShort: function () { if (store.get().phase === 'thinking') resetToListening() }
        })
        cur.es = esRef && esRef.readyState !== 2 ? esRef : openEvents()
        try {
          await cur.mic.start()
        } catch (e) {
          store.set({ lastError: t('micDenied') + String((e && (e.message || e.name)) || e) })
          if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
            store.set({ needsGesture: true })
            armGestureStart()
          }
        }
        store.set({
          call: true, connecting: false, sessionId: voiceId, voiceSessionId: voiceId,
          chatSessionId: sessionId || store.get().chatSessionId, settings: settings,
          voices: voices, phase: 'listening', panelOpen: false, partial: '', micMuted: false
        })
        writeWantCall(true)
        void withTimeout(ensureSession(voiceId), 8000, 'prewarm')
        try {
          cur.idleTimer = setInterval(function () {
            try {
              if (!cur) return
              var idleMs = Number((cur.settings || {}).idleNewSessionMs)
              if (!(idleMs > 0)) return
              if (cur.player && cur.player.isSpeaking()) { cur.lastUtterAt = Date.now(); return }
              var ph = store.get().phase
              if (ph === 'thinking' || ph === 'connecting') return
              if (!store.get().call) return
              if (Date.now() - (cur.lastUtterAt || 0) < idleMs) return
              cur.lastUtterAt = Date.now()
              reportTag('idle-new-session', { idleMs: idleMs })
              void resetSession()
            } catch (e) {}
          }, 15000)
          if (cur.idleTimer && typeof cur.idleTimer.unref === 'function') cur.idleTimer.unref()
        } catch (e) {}
        return true
      }

      /* 只在本地停止（不 POST /stop）：当另一个窗口接管通话时，本窗口必须安静退场，
         但不能把别人的会话也停掉。 */
      function stopLocalOnly(reason) {
        try { if (cur && cur.mic) cur.mic.dispose() } catch (e) {}
        try { if (cur && cur.player) cur.player.stopAll() } catch (e) {}
        try { if (cur && cur.es) cur.es.close() } catch (e) {}
        try { if (cur && cur.ac) cur.ac.close() } catch (e) {}
        try { if (cur && cur.idleTimer) clearInterval(cur.idleTimer) } catch (e) {}
        cur = null
        writeWantCall(true)
        store.set({ call: false, connecting: false, phase: 'idle', level: 0, speaking: false, queueLen: 0, panelOpen: false, partial: '', lastError: reason || '' })
        releaseSessions()
      }

      async function stopCall() {
        var c = cur
        cur = null
        writeWantCall(false)
        store.set({ call: false, connecting: false, phase: 'idle', level: 0, speaking: false, queueLen: 0, panelOpen: false, partial: '' })
        if (!c) return
        try { if (c.idleTimer) clearInterval(c.idleTimer) } catch (e) {}
        /* 常驻控制通道保持连接：挂断只停音频，面板/自检/导航仍需收事件 */
        try { if (c.mic) c.mic.dispose() } catch (e) {}
        try { if (c.player) c.player.stopAll() } catch (e) {}
        try { if (window.speechSynthesis) window.speechSynthesis.cancel() } catch (e) {}
        try { c.ac.close() } catch (e) {}
        try { await api('/stop', { method: 'POST', body: { tabId: TAB_ID } }) } catch (e) {}
        releaseSessions()
      }

      async function interrupt(bySpeech) {
        if (!cur) return
        var c = cur
        try { c.player.duck() } catch (e) {}
        try { c.player.stopAll() } catch (e) {}
        try { if (window.speechSynthesis) window.speechSynthesis.cancel() } catch (e) {}
        setPhase('listening')
        try { api('/interrupt', { method: 'POST', body: { tabId: TAB_ID } }) } catch (e) {}
        try {
          var s = getSession(c.sessionId)
          if (s && typeof s.cancel === 'function') s.cancel()
        } catch (e) {}
      }

      async function skip() {
        if (!cur) return
        var c = cur
        try { c.player.stopAll() } catch (e) {}
        try { if (window.speechSynthesis) window.speechSynthesis.cancel() } catch (e) {}
        setPhase('listening')
        try { api('/skip', { method: 'POST', body: { tabId: TAB_ID } }) } catch (e) {}
      }

      async function updateSettings(patch) {
        if (cur && patch && typeof patch === 'object') cur.settings = Object.assign({}, cur.settings || {}, patch)
        var next = Object.assign({}, (cur && cur.settings) || store.get().settings || {}, patch)
        if (cur) cur.settings = next
        store.set({ settings: next })
        var r = await api('/settings', { method: 'POST', body: patch })
        if (r && r.ok !== false) {
          var merged = Object.assign({}, next, stripOk(r))
          if (cur) cur.settings = merged
          store.set({ settings: merged })
        }
      }

      function toggle(sessionId) {
        if (store.get().call || cur) return stopCall()
        return startCall(sessionId || store.get().sessionId)
      }

      var gestureArmed = false

      function armGestureStart() {
        if (gestureArmed) return
        gestureArmed = true
        var once = function () {
          gestureArmed = false
          try { document.removeEventListener('pointerdown', once, true) } catch (e) {}
          try { document.removeEventListener('keydown', once, true) } catch (e) {}
          if (cur) return
          var cfg = store.get().settings || {}
          if (cfg.autoStart === false) return
          store.set({ needsGesture: false })
          void startCall(store.get().chatSessionId || null)
        }
        try {
          document.addEventListener('pointerdown', once, true)
          document.addEventListener('keydown', once, true)
        } catch (e) {}
      }

      function chime() {
        var cfg = store.get().settings || {}
        if (cfg.chime === false) return
        try {
          var ac = (cur && cur.ac) || new (window.AudioContext || window.webkitAudioContext)()
          if (ac.state === 'suspended') { void ac.resume() }
          var t0 = ac.currentTime + 0.01
          ;[880, 1180].forEach(function (f, i) {
            var o = ac.createOscillator()
            var g = ac.createGain()
            o.type = 'sine'
            o.frequency.value = f
            var at = t0 + i * 0.1
            g.gain.setValueAtTime(0.0001, at)
            g.gain.exponentialRampToValueAtTime(0.14, at + 0.02)
            g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16)
            o.connect(g)
            g.connect(ac.destination)
            o.start(at)
            o.stop(at + 0.2)
          })
        } catch (e) {}
      }

      function setChatSession(sessionId) {
        if (!sessionId) return
        var prev = store.get().chatSessionId
        if (prev === sessionId) return
        store.set({ chatSessionId: sessionId })
        runtime.lastSessionId = sessionId
        if (cur && !cur.chatSessionId) cur.chatSessionId = sessionId
        if (!cur && store.get().booted) {
          var cfg = store.get().settings || {}
          if (cfg.autoStart !== false && !store.get().needsGesture) void startCall(sessionId)
        }
      }

      function readWantCall() {
        try {
          var raw = window.localStorage.getItem(WANT_KEY)
          return raw === null ? null : raw === '1'
        } catch (e) { return null }
      }

      function writeWantCall(v) {
        try { window.localStorage.setItem(WANT_KEY, v ? '1' : '0') } catch (e) {}
      }

      async function checkBuild() {
        try {
          var r = await api('/build')
          if (!r || r.ok === false || !r.build) return
          if (r.build === CLIENT_BUILD) return
          /* 绝不自动 location.reload()：
             页面重载会和 DSH 的 web boot 抢时序，曾把整个应用拖崩（web boot: entry did not activate）。
             只提示一次，由用户自己 Ctrl+Shift+R。 */
          if (!window.__vcStaleNotified) {
            window.__vcStaleNotified = true
            reportTag('client-stale', { page: CLIENT_BUILD, host: r.build })
            store.set({ lastError: '界面是旧版本（' + CLIENT_BUILD + ' → ' + r.build + '），按 Ctrl+Shift+R 刷新即可' })
          }
        } catch (e) {}
      }

      async function bootstrap() {
        try {
          var stt = await api('/state')
          if (stt && stt.ok !== false) applyState(stt)
        } catch (e) {}
        try {
          var sr = await api('/settings')
          if (sr && sr.ok !== false) {
            var s = stripOk(sr)
            store.set({ settings: s })
            if (cur) cur.settings = s
          }
        } catch (e) {}
        store.set({ booted: true, lines: loadLines() })
        reportTag('client-build', { build: CLIENT_BUILD })
        // 常驻控制通道：不进通话也保持一条 SSE，面板/自检/语音导航随时可用
        if (!esRef) openEvents()
        void checkBuild()
        if (store.get().call) return
        var cfg = store.get().settings || {}
        if (cfg.autoStart === false) return
        // 记住上次是否挂断：挂断过就不在刷新后自作主张开麦
        if (readWantCall() === false) return
        void startCall(store.get().chatSessionId || runtime.lastSessionId || null)
      }

      async function resetSession() {
        try { await api('/session', { method: 'POST', body: { reset: true } }) } catch (e) {}
        clearTranscript()
        releaseSessions()
        store.set({ voiceSessionId: null, sessionId: null, lastError: '' })
        if (cur) cur.sessionId = null
        if (store.get().call) {
          await stopCall()
          void startCall(store.get().chatSessionId || null)
        }
      }

      function clearTranscript() {
        store.set({ lines: [], partial: '' })
        try { window.localStorage.removeItem(TRANSCRIPT_KEY) } catch (e) {}
      }

      function dispose() {
        try { if (esRef) esRef.close() } catch (e) {}
        esRef = null
        try { if (cur && cur.mic) cur.mic.dispose() } catch (e) {}
        try { if (cur && cur.player) cur.player.stopAll() } catch (e) {}
        try { if (cur && cur.ac) cur.ac.close() } catch (e) {}
        cur = null
        releaseSessions()
      }

      var orbDeadline = 0

      function orbAutoMs() {
        var ms = Number((store.get().settings || {}).orbAutoHideMs)
        return isFinite(ms) ? ms : 8000
      }

      function orbBlocked() {
        var st = store.get()
        if (!st.orbExpanded) return true
        // 用户主动让它完整显露时，不被自动收起抢走
        if (st.orbManual) return true
        if (st.panelOpen) return true
        if (st.needsGesture) return true
        var ph = st.phase
        if (ph === 'speaking' || ph === 'thinking' || ph === 'connecting') return true
        return false
      }

      function touchOrb() {
        var ms = orbAutoMs()
        orbDeadline = ms > 0 ? Date.now() + ms : 0
      }

      // 每 500ms 由 apply 里的定时器调用：条件解除后才开始计时，超时就收起
      function tickOrbHide() {
        var st = store.get()
        if (!st.orbExpanded) { orbDeadline = 0; return }
        if (orbBlocked()) { orbDeadline = 0; return }
        var ms = orbAutoMs()
        if (ms <= 0) { orbDeadline = 0; return }
        if (!orbDeadline) orbDeadline = Date.now() + ms
        if (Date.now() >= orbDeadline) {
          orbDeadline = 0
          store.set({ orbWantHide: Date.now() })
          dbg('orb-hide', { why: 'idle', ms: ms })
        }
      }

      /* 麦克风体检：上下文被挂起就唤醒，轨道断了就重取一次 */
      async function recoverMic(reason, force) {
        if (!cur || !cur.mic || !cur.mic.health) return false
        var h = cur.mic.health()
        if (h.acState !== 'running') {
          try { await cur.ac.resume() } catch (e) {}
          if (cur.ac.state !== 'running') {
            store.set({ needsGesture: true })
            armGestureStart()
            dbg('mic-need-gesture', { reason: reason, state: cur.ac.state })
            return false
          }
        }
        if (force || h.track !== 'live') {
          try {
            await cur.mic.restart()
            reportTag('mic-recover', { reason: reason, force: !!force, was: h.track })
            return true
          } catch (e) {
            reportTag('mic-recover-failed', { reason: reason, message: String((e && (e.message || e.name)) || e) })
            if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
              store.set({ needsGesture: true })
              armGestureStart()
            }
            return false
          }
        }
        return true
      }

      function tickMic() {
        var st = store.get()
        if (!cur || !st.call || st.micMuted) return
        void recoverMic('tick', false)
      }

      return {
        start: startCall, stop: stopCall, toggle: toggle, skip: skip, interrupt: interrupt,
        recoverMic: function () { return recoverMic('manual', true) },
        tickMic: tickMic,
        updateSettings: updateSettings, dispose: dispose,
        setInputActions: function (actions) { inputActions = actions },
        getSessionId: function () { return cur ? cur.sessionId : null },
        isCalling: function () { return !!cur },
        setMuted: function (v) { store.set({ micMuted: !!v }) },
        toggleMute: function () { var m = !store.get().micMuted; store.set({ micMuted: m }); return m },
        toggleFan: function () { var v = !store.get().fanOpen; store.set({ fanOpen: v }); touchOrb(); return v },
        closeFan: function () { store.set({ fanOpen: false }) },
        revealOrb: function () { store.set({ orbExpanded: true, orbManual: true, orbWantHide: 0 }); touchOrb() },
        collapseOrb: function () { orbDeadline = 0; store.set({ orbExpanded: false, orbManual: false }) },
        touchOrb: touchOrb,
        tickOrbHide: tickOrbHide,
        hideOrbNow: function (why) {
          var st = store.get()
          if (!st.orbExpanded || st.panelOpen) return
          orbDeadline = 0
          store.set({ orbWantHide: Date.now() })
          dbg('orb-hide', { why: why || 'outside' })
        },
        openPanel: function (v) { var open = v === undefined ? true : !!v; store.set({ panelOpen: open, unread: 0, orbExpanded: open, orbManual: open }) },
        beginPanelDrag: function (ev) {
          try {
            if (!ev || ev.button !== 0) return
            ev.preventDefault()
            var st0 = store.get()
            var pos0 = st0.panelPos || { x: 0, y: 0 }
            var ox = pos0.x || 0
            var oy = pos0.y || 0
            var sx = ev.clientX
            var sy = ev.clientY
            function move(e) {
              store.set({ panelPos: { x: Math.round(ox + (e.clientX - sx)), y: Math.round(oy + (e.clientY - sy)) } })
            }
            function up() {
              window.removeEventListener('pointermove', move)
              window.removeEventListener('pointerup', up)
              window.removeEventListener('pointercancel', up)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', up)
            window.addEventListener('pointercancel', up)
          } catch (e) {}
        },
        resetPanelPos: function () { store.set({ panelPos: { x: 0, y: 0 } }) },
        setChatSession: setChatSession,
        bootstrap: bootstrap,
        resetSession: resetSession,
        clearTranscript: clearTranscript,
        chime: chime,
        retryStart: function () { store.set({ needsGesture: false }); return startCall(store.get().chatSessionId || null) },
        toggleSettings: function () { store.set(function (s) { return Object.assign({}, s, { showSettings: !s.showSettings }) }) },
        openRecords: function () {
          store.set({ recordsOpen: true, recordsError: '' })
          void refreshRecords()
          void refreshDelegations()
          void requestTopicTitle(store.get().voiceSessionId || null)
        },
        closeRecords: function () { store.set({ recordsOpen: false, recordsDetail: null }) },
        takeOver: function () { return startCall(store.get().chatSessionId, { force: true }) },
        openSessionConv: function (id) {
          try {
            var uw = serviceOf('uiWorkspace')
            if (uw && typeof uw.openSession === 'function') { uw.openSession(id); return true }
          } catch (e) {}
          try {
            var uw2 = serviceOf('uiWorkspace')
            if (uw2 && typeof uw2.openSession === 'function') { uw2.openSession({ sessionId: id }); return true }
          } catch (e) {}
          return false
        },
        openRecordsPage: function () {
          try {
            var layout = serviceOf('layout')
            if (layout && typeof layout.selectPanel === 'function') { layout.selectPanel('voice-records'); return true }
          } catch (e) {}
          try { store.set({ recordsOpen: true, recordsError: '' }); void refreshRecords() } catch (e) {}
          return false
        },
        refreshRecords: refreshRecords,
        exportAllRecords: exportAllRecords,
        refreshDelegations: refreshDelegations,
        runSmoke: function (id) { return runSmoke(id) },
        cancelDelegation: cancelDelegation,
        retryDelegation: retryDelegation,
        renameRecord: renameRecord,
        regenerateTitle: regenerateTitle,
        openRecord: openRecord,
        playRecordEntry: playRecordEntry,
        deleteRecordById: deleteRecordById,
        clearAllRecords: clearAllRecords,
        exportRecordById: exportRecordById,
        setRecordsFilter: function (v) {
          var q = String(v || '')
          store.set({ recordsFilter: q })
          globalSearch(q)
        }
      }
    }

    /* ------------------------------------------------------------------ */
    /* 运行时引用（apply 时赋值，组件里读取）                               */
    /* ------------------------------------------------------------------ */
    /* 运行时引用（apply 时赋值，组件里读取）                                 */
    /* ------------------------------------------------------------------ */
    var runtime = { store: null, ctrl: null, ctx: null, lastSessionId: null }

    function phaseLabel(phase, muted) {
      if (muted) return t('muted')
      if (phase === 'listening') return t('listening')
      if (phase === 'thinking') return t('thinking')
      if (phase === 'speaking') return t('speaking')
      return t('idle')
    }

    /* 状态优先级：需要手势 > 待机 > 已静音 > 思考 > 朗读 > 聆听 */
    function statusOf(st) {
      if (st.busyElsewhere) return { key: 'elsewhere', label: t('elsewhere'), tone: 'idle' }
      var calling = !!st.call
      if (!calling) {
        return st.needsGesture
          ? { key: 'needs', label: t('orbGesture'), tone: 'warn' }
          : { key: 'idle', label: t('orbIdle'), tone: 'idle' }
      }
      if (st.micMuted) return { key: 'muted', label: t('muted'), tone: 'error' }
      if (st.phase === 'thinking') return { key: 'thinking', label: t('thinking'), tone: 'warn' }
      if (st.phase === 'speaking') return { key: 'speaking', label: t('speaking'), tone: 'brand' }
      return { key: 'listening', label: t('listening'), tone: 'ok' }
    }

    function rateToPercent(rate) {
      var n = parseFloat(String(rate || '+0%').replace('%', ''))
      return isNaN(n) ? 0 : n
    }

    function percentToRate(v) { return (v >= 0 ? '+' : '') + Math.round(v) + '%' }

    function defaultOrbPos() {
      var vh = Number(window.innerHeight) || 800
      return { x: 0, y: Math.max(80, vh - 220), edge: 'right' }
    }

    function readOrbPos() {
      try {
        var raw = window.localStorage.getItem(ORB_POS_KEY)
        if (!raw) return defaultOrbPos()
        var p = JSON.parse(raw) || {}
        var ok = p.edge === 'left' || p.edge === 'right'
        if (ok) {
          var y0 = Number(p.y) || 0
          if (!y0) return defaultOrbPos()
          return { x: 0, y: y0, edge: p.edge }
        }
        if (p.edge === 'top' || p.edge === 'bottom') {
          // 旧版的上下吸附统一折算成左右
          var xx = Number(p.x) || 0
          var yy = Number(p.y) || 0
          var vw0 = Number(window.innerWidth) || 1024
          var leftSide = xx <= vw0 / 2
          return { x: 0, y: yy || Math.max(80, (Number(window.innerHeight) || 800) - 220), edge: leftSide ? 'left' : 'right' }
        }
        // 旧版本只存了 {x,y} 的位移量：按屏幕象限迁移到最近的一条边
        var vw = Number(window.innerWidth) || 1024
        var vh = Number(window.innerHeight) || 800
        var lx = Number(p.x) || 0
        var ly = Number(p.y) || 0
        if (!lx && !ly) return defaultOrbPos()
        var anchorX = lx + vw - 76
        var anchorY = ly + vh - 146
        var toRight = vw - anchorX
        var toLeft = anchorX
        var toBottom = vh - anchorY
        var toTop = anchorY
        var min = Math.min(toRight, toLeft, toBottom, toTop)
        if (min === toLeft) return { x: 0, y: Math.max(0, anchorY - 27), edge: 'left' }
        if (min === toRight) return { x: 0, y: Math.max(0, anchorY - 27), edge: 'right' }
        if (min === toTop) return { x: Math.max(0, anchorX - 29), y: 0, edge: 'top' }
        return { x: Math.max(0, anchorX - 29), y: 0, edge: 'bottom' }
      } catch (e) { return defaultOrbPos() }
    }

    function writeOrbPos(p) {
      try { window.localStorage.setItem(ORB_POS_KEY, JSON.stringify(p)) } catch (e) {}
    }

    /* ------------------------------------------------------------------ */
    /* 常驻悬浮球：未展开时的唯一入口，随音量呼吸                              */
    /* ------------------------------------------------------------------ */
    function OrbDock() {
      var st = useStore(runtime.store)
      var seed = readOrbPos()
      var [pos, setPos] = useState(seed)
      var [dragging, setDragging] = useState(false)
      var posRef = useRef(seed)
      var rootRef = useRef(null)
      var bodyRef = useRef(null)

      React.useEffect(function () {
        function onResize() {
          try {
            var st2 = runtime.store.get()
            var isExp = !!(st2.orbExpanded || st2.panelOpen)
            var cur = posRef.current || {}
            var vw2 = Math.max(320, Number(window.innerWidth) || 1024)
            var vh2 = Math.max(320, Number(window.innerHeight) || 768)
            var e2 = cur.edge || null
            var w2 = isExp ? 54 : (e2 === 'top' || e2 === 'bottom' ? 58 : 22)
            var h2 = isExp ? 54 : (e2 === 'top' || e2 === 'bottom' ? 22 : 58)
            var x2 = Number(cur.x) || 0
            var y2 = Number(cur.y) || 0
            var left2 = e2 === 'right' ? vw2 - w2 : (e2 === 'left' ? 0 : Math.min(Math.max(x2, 0), vw2 - w2))
            var top2 = e2 === 'bottom' ? vh2 - h2 : (e2 === 'top' ? 0 : Math.min(Math.max(y2, 0), vh2 - h2))
            var next = { x: left2, y: top2, edge: e2 }
            posRef.current = next
            setPos(next)
            writeOrbPos(next)
          } catch (err) {}
        }
        window.addEventListener('resize', onResize)
        try { runtime.store.set({ orbEdge: seed && seed.edge ? seed.edge : null }) } catch (err) {}
        return function () { try { window.removeEventListener('resize', onResize) } catch (err) {} }
      }, [])

      React.useEffect(function () {
        if (!st.orbWantHide) return
        try {
          var box = place(posRef.current, true)
          var cx = box.left + box.w / 2
          var vhNow = Number(window.innerHeight) || 768
          var yTab = Math.min(Math.max(box.top, 0), Math.max(0, vhNow - 58))
          var next = { x: 0, y: Math.round(yTab), edge: cx < (Number(window.innerWidth) || 1024) / 2 ? 'left' : 'right' }
          posRef.current = next
          setPos(next)
          writeOrbPos(next)
          runtime.store.set({ orbEdge: next.edge, orbWantHide: 0 })
          reportTag('orb-snap', { edge: next.edge, y: Math.round(next.y) })
          if (runtime.ctrl) runtime.ctrl.collapseOrb()
        } catch (e) {}
      }, [st.orbWantHide])

      function touchOrb() {
        try { if (runtime.ctrl && runtime.ctrl.touchOrb) runtime.ctrl.touchOrb() } catch (e) {}
      }

      if (!st.booted) return null
      if (st.panelOpen) return null

      var calling = !!st.call
      var phase = st.phase
      var level = Math.max(0, Math.min(1, Number(st.level) || 0))
      var expanded = !!(st.orbExpanded || st.panelOpen)
      var edge = pos && pos.edge ? pos.edge : null
      var status = statusOf(st)
      var label = status.label

      var vw = Math.max(320, Number(window.innerWidth) || 1024)
      var vh = Math.max(320, Number(window.innerHeight) || 768)

      function sizeOf(isExp, e) {
        if (isExp) return { w: 54, h: 54 }
        if (e === 'top' || e === 'bottom') return { w: 58, h: 22 }
        return { w: 28, h: 58 }
      }

      function place(p, isExp) {
        var e = p && p.edge ? p.edge : null
        var sz = sizeOf(isExp, e)
        var x = Number(p && p.x) || 0
        var y = Number(p && p.y) || 0
        var left
        var top
        if (e === 'right') { left = vw - sz.w; top = Math.min(Math.max(y, 0), vh - sz.h) }
        else if (e === 'left') { left = 0; top = Math.min(Math.max(y, 0), vh - sz.h) }
        else if (e === 'top') { left = Math.min(Math.max(x, 0), vw - sz.w); top = 0 }
        else if (e === 'bottom') { left = Math.min(Math.max(x, 0), vw - sz.w); top = vh - sz.h }
        else { left = Math.min(Math.max(x, 0), vw - sz.w); top = Math.min(Math.max(y, 0), vh - sz.h) }
        return { left: left, top: top, w: sz.w, h: sz.h, edge: e }
      }

      function snap(p, isExp) {
        // 屏幕按中线分成左右两半：落在哪半就吸到哪条边（不保留自由漂浮态，
        // 否则停在中部再自动收起会显得很别扭）
        var box = place({ x: p.x, y: p.y, edge: null }, isExp)
        var cx = box.left + box.w / 2
        return { x: 0, y: box.top, edge: cx < vw / 2 ? 'left' : 'right' }
      }

      var lastTabClick = 0



      function stop(ev) { try { if (ev && ev.stopPropagation) ev.stopPropagation() } catch (e) {} }

      function onPointerDown(ev) {
        if (ev.button !== 0 && ev.pointerType === 'mouse') return
        try { runtime.store.set({ orbManual: false }) } catch (e) {}
        var box = place(posRef.current, expanded)
        var startX = ev.clientX
        var startY = ev.clientY
        var moved = false
        var tick = 0
        var startRect = null
        try { startRect = ev.currentTarget.getBoundingClientRect() } catch (e) {}
        try {
          var host = bodyRef.current
          if (host) {
            var cs0 = window.getComputedStyle(host)
            reportTag('drag-start', {
              cls: String(host.className || ''),
              w: host.offsetWidth, h: host.offsetHeight,
              left: cs0.left, right: cs0.right, width: cs0.width,
              pos: cs0.position, transform: cs0.transform,
              parentCls: host.parentElement ? String(host.parentElement.className || '') : '',
              parentW: host.parentElement ? host.parentElement.offsetWidth : 0,
              iw: window.innerWidth,
              orbRect: Math.round(startRect ? startRect.width : 0)
            })
          }
        } catch (e0) {}
        try { ev.currentTarget.setPointerCapture(ev.pointerId) } catch (e) {}
        function move(e) {
          var dx = e.clientX - startX
          var dy = e.clientY - startY
          if (!moved && Math.abs(dx) + Math.abs(dy) > 5) { moved = true; setDragging(true) }
          if (!moved) return
          var next = { x: box.left + dx, y: box.top + dy, edge: null }
          posRef.current = next
          var body = bodyRef.current
          if (body) {
            body.style.transform = 'translate3d(' + next.x + 'px,' + next.y + 'px,0)'
          } else {
            setPos(next)
          }
          tick += 1
          if (tick % 8 === 1) {
            try {
              var el2 = bodyRef.current || e.currentTarget
              var r2 = el2.getBoundingClientRect()
              reportTag('drag-probe', {
                dx: Math.round(dx), dy: Math.round(dy),
                left: Math.round(box.left), top: Math.round(box.top),
                rectL: Math.round(r2.left), rectT: Math.round(r2.top),
                rectW: Math.round(r2.width), offW: el2.offsetWidth,
                scaleX: Number((r2.width / (el2.offsetWidth || r2.width)).toFixed(4)),
                dpr: Number(window.devicePixelRatio) || 0,
                zoom: String((document.body.style.zoom || 'none')),
                cs: (function () { try { var c2 = window.getComputedStyle(el2); return c2.left + '/' + c2.right + '/' + c2.width } catch (e3) { return '' } })(),
                iw: window.innerWidth
              })
            } catch (e2) {}
          }
        }
        function up() {
          try { window.removeEventListener('pointermove', move) } catch (e) {}
          try { window.removeEventListener('pointerup', up) } catch (e) {}
          var bodyEl = bodyRef.current
          setDragging(false)
          if (!moved) {
            // 没拖动：把内联 transform 与当前坐标对齐，避免清空后瞬间掉到 (0,0)
            var keep = place(posRef.current, expanded)
            if (bodyEl) bodyEl.style.transform = 'translate3d(' + keep.left + 'px,' + keep.top + 'px,0)'
            activate()
            return
          }
          // 松手就停留在拖到的位置（不立刻吸附、不收起）；
          // 真正需要隐藏时（点外面 / 倒计时结束）才吸附到就近一侧
          var free = { x: Math.round(posRef.current.x), y: Math.round(posRef.current.y), edge: null }
          posRef.current = free
          setPos(free)
          writeOrbPos(free)
          try { runtime.store.set({ orbEdge: null, orbManual: false }) } catch (e) {}
          touchOrb()
          reportTag('orb-drop', { x: free.x, y: free.y })
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }

      function activate() {
        try {
          if (!runtime.ctrl) return
          // 展开后点球 = 开合三个功能入口（提示气泡随之消失/冒出）
          if (!expanded) { runtime.ctrl.revealOrb(); return }
          runtime.ctrl.toggleFan()
        } catch (e) {}
      }

      function expandPanel(ev) {
        try {
          if (ev && ev.stopPropagation) ev.stopPropagation()
          if (!runtime.ctrl) return
          runtime.ctrl.revealOrb()
          runtime.ctrl.openPanel(true)
        } catch (e) {}
      }

      function fanMic(ev) {
        stop(ev)
        try {
          if (!runtime.ctrl) return
          if (!calling) {
            if (st.needsGesture) runtime.ctrl.retryStart()
            else runtime.ctrl.start(st.chatSessionId)
            return
          }
          runtime.ctrl.toggleMute()
          runtime.ctrl.touchOrb()
        } catch (e) {}
      }

      function fanHistory(ev) {
        stop(ev)
        try {
          expandPanel()
          runtime.ctrl.openRecords()
        } catch (e) {}
      }

      var micState = calling ? (st.micMuted ? 'muted' : 'live') : 'idle'
      var fanItems = expanded && st.fanOpen ? [
        {
          key: 'mic',
          label: micState === 'muted' ? t('unmute') : (micState === 'idle' ? t('orbStart') : t('mute')),
          state: micState,
          click: fanMic,
          icon: h('svg', { viewBox: '0 0 24 24', width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
            micState === 'live' ? null : h('path', { d: 'M3 3l18 18' }),
            h('rect', { x: 9, y: 3, width: 6, height: 11, rx: 3 }),
            h('path', { d: 'M5 11a7 7 0 0 0 12 0' }),
            h('path', { d: 'M12 18v3' }))
        },
        {
          key: 'card', label: t('orbExpand'), on: false, click: expandPanel,
          icon: h('svg', { viewBox: '0 0 24 24', width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
            h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 4 }),
            h('path', { d: 'M9.5 4v16' }))
        },
        {
          key: 'history', label: t('recordsHistory'), on: false, click: fanHistory,
          icon: h('svg', { viewBox: '0 0 24 24', width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
            h('circle', { cx: 12, cy: 12, r: 8.5 }),
            h('path', { d: 'M12 7.5V12l3 2' }))
        }
      ] : null

      var box = place(pos, expanded)

      return h('div', {
        ref: rootRef,
        className: 'vc-dock' +
          (dragging ? ' vc-dock-dragging' : '') +
          (expanded ? ' vc-dock-expanded' : ' vc-dock-collapsed') +
          (edge ? ' vc-dock-edge-' + edge : ''),
        onPointerEnter: touchOrb,
        onPointerMove: touchOrb,
        onPointerDown: touchOrb,
        'data-edge': edge || 'free'
      },
        h('div', {
          ref: bodyRef,
          className: 'vc-dock-body',
          style: { transform: 'translate3d(' + box.left + 'px,' + box.top + 'px,0)' }
        },
        h('div', {
          className: 'vc-dock-hint' + (expanded && !st.fanOpen ? ' vc-dock-hint-live' : '') + (status.key === 'muted' ? ' vc-dock-hint-muted' : '')
        }, label),
        h('div', {
          className: 'vc-dock-stack',
          style: expanded ? { transform: 'none' } : { display: 'none' }
        },
        h('button', {
          type: 'button',
          className: 'vc-dock-orb' + (calling && !st.micMuted ? ' vc-dock-on' : '') + (status.key === 'speaking' ? ' vc-dock-speaking' : '') + (status.key === 'needs' ? ' vc-dock-needs' : '') + (status.key === 'muted' ? ' vc-dock-muted' : ''),
          onPointerDown: onPointerDown,
          'aria-label': !expanded ? t('orbReveal') : (calling ? (st.micMuted ? t('unmute') : t('mute')) : t('orbStart'))
        },
          h('span', {
            className: 'vc-dock-ring',
            style: { opacity: String(0.25 + level * 0.75), transform: 'scale(' + (1 + level * 0.35).toFixed(3) + ')' }
          }),
          h('svg', {
            viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor',
            strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true'
          },
            h('rect', { x: 9, y: 2, width: 6, height: 12, rx: 3 }),
            h('path', { d: 'M5 10a7 7 0 0 0 14 0' }),
            h('path', { d: 'M12 17v4' }),
            h('path', { d: 'M8 21h8' })
          ),
          h('span', {
            className: 'vc-dock-badge vc-dock-badge-' + status.tone,
            'data-phase': calling ? phase : 'idle'
          }),
          st.unread > 0 ? h('span', { className: 'vc-dock-unread' }, String(st.unread)) : null
        )
        ),
        fanItems ? h('div', { className: 'vc-fan', role: 'group', 'aria-label': t('orbExpand') },
          fanItems.map(function (it, i) {
            return h('button', {
              key: it.key,
              type: 'button',
              className: 'vc-fan-btn' + (it.state === 'muted' ? ' vc-fan-btn-off' : '') + (it.state === 'idle' ? ' vc-fan-btn-idle' : '') + (it.state === 'live' ? ' vc-fan-btn-live' : ''),
              'data-mic-state': it.state || null,
              style: { animationDelay: String(i * 40) + 'ms' },
              onPointerDown: stop,
              onClick: it.click,
              'aria-label': it.label
            }, it.icon)
          })
        ) : null,

        !expanded ? h('div', {
          role: 'button',
          tabIndex: 0,
          className: 'vc-dock-tab' + (calling ? ' vc-dock-tab-on' : ' vc-dock-tab-idle') + (status.key === 'speaking' ? ' vc-dock-tab-speaking' : '') + (status.key === 'muted' ? ' vc-dock-tab-muted' : ''),
          onPointerDown: function (ev) { try { ev.stopPropagation() } catch (e) {} },
          onPointerEnter: function (ev) { document.body.dataset.vcProbe = 1 },
          onPointerLeave: function (ev) { document.body.dataset.vcProbe = 0 },
          onClick: function (ev) {
            try { ev.stopPropagation() } catch (e) {}
            var now = Date.now()
            if (now - lastTabClick < 300) return
            lastTabClick = now
            activate()
          },
          onDoubleClick: function (ev) {
            try { ev.preventDefault(); ev.stopPropagation() } catch (e) {}
            var next = defaultOrbPos()
            posRef.current = next
            setPos(next)
            writeOrbPos(next)
            try { runtime.store.set({ orbEdge: next.edge }) } catch (e) {}
            if (runtime.ctrl) runtime.ctrl.collapseOrb()
            reportTag('orb-reset', { edge: next.edge, y: Math.round(next.y) })
          },
          onKeyDown: function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { try { ev.preventDefault() } catch (e) {} activate() }
          },
          'aria-label': t('orbReveal')
        },
          h('span', { className: 'vc-dock-puck' },
            h('span', { className: 'vc-dock-puck-icon' },
              h('svg', {
                className: 'vc-dock-tab-icon',
                viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor',
                strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true'
              },
                st.micMuted ? h('path', { d: 'M4 4l16 16' }) : null,
                h('rect', { x: 9.5, y: 3, width: 5, height: 10, rx: 2.5 }),
                h('path', { d: 'M6.5 11a5.5 5.5 0 0 0 11 0' })
              )
            )
          )
        ) : null
      )
        )
    }

    /* ------------------------------------------------------------------ */
    /* 展开卡片                                                             */
    /* ------------------------------------------------------------------ */
    function CallPanel() {
      var st = useStore(runtime.store)

      if (!st.panelOpen) return null

      var panelPos = st.panelPos || { x: 0, y: 0 }

      function onHeadDown(ev) {
        try { runtime.ctrl.beginPanelDrag(ev) } catch (e) {}
      }

      function hangup() { try { runtime.ctrl.stop() } catch (e) {} }
      function collapse() { try { runtime.ctrl.openPanel(false) } catch (e) {} }

      var lines = st.lines || []
      var visible = lines.slice(Math.max(0, lines.length - 10))
      var topicList = st.recordsList || []
      var topicCur = null
      for (var ti = 0; ti < topicList.length; ti += 1) {
        if (topicList[ti] && topicList[ti].sessionId === st.voiceSessionId) { topicCur = topicList[ti]; break }
      }
      var topicTitle = topicCur && topicCur.title ? String(topicCur.title) : ''
      var turnNow = Number(st.turns || 0)
      var turnCap = Number((st.settings && st.settings.autoCompactTurns) || 20)
      var usagePct = turnCap > 0 ? Math.min(100, Math.round((turnNow / turnCap) * 100)) : 0
      var showSubs = !st.settings || st.settings.showSubtitles !== false

      return h('div', { className: 'vc-panel', style: { transform: 'translate(' + (panelPos.x || 0) + 'px,' + (panelPos.y || 0) + 'px)' } },
        h('div', { className: 'vc-head', onPointerDown: onHeadDown },
          h('span', { className: 'vc-dot', 'data-phase': statusOf(st).key }),
          h('span', { className: 'vc-title' }, t('name')),
          h('span', { className: 'vc-phase' }, statusOf(st).label),
          topicTitle ? h('span', { className: 'vc-topic', title: topicTitle }, topicTitle) : null,
          h('span', { className: 'vc-usage', title: t('usageHint') }, turnNow + '/' + turnCap + ' · ' + usagePct + '%'),
          h('button', { type: 'button', className: 'vc-icon', title: t('recordsHistory'), onClick: function () { runtime.ctrl.openRecords() } },
            h('svg', { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
              h('path', { d: 'M8 6h13M8 12h13M8 18h13' }),
              h('circle', { cx: 3.5, cy: 6, r: 1 }),
              h('circle', { cx: 3.5, cy: 12, r: 1 }),
              h('circle', { cx: 3.5, cy: 18, r: 1 })
            )
          ),
          h('button', { type: 'button', className: 'vc-icon', title: t('settings'), onClick: function () { runtime.ctrl.toggleSettings() } },
            h('svg', { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
              h('circle', { cx: 12, cy: 12, r: 3 }),
              h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' })
            )
          ),
          h('button', { type: 'button', className: 'vc-icon', title: t('collapse'), onClick: collapse }, '\u2013')
        ),
        st.otherTab ? h('div', { className: 'vc-warn' }, t('otherTab')) : null,
        h('div', { className: 'vc-orb-wrap' },
          h('button', {
            type: 'button',
            className: 'vc-orb' + (st.call && st.micMuted ? ' vc-orb-muted' : '') + (statusOf(st).key === 'speaking' ? ' vc-orb-speaking' : ''),
            onClick: function () { if (st.call) runtime.ctrl.setMuted(!st.micMuted); else runtime.ctrl.start(st.chatSessionId) },
            title: st.call ? (st.micMuted ? t('unmute') : t('mute')) : t('idleStart'),
            'aria-pressed': !!(st.call && st.micMuted)
          },
            h('span', { className: 'vc-orb-pulse', style: { opacity: String(0.18 + st.level * 0.7), transform: 'scale(' + (1 + st.level * 0.45).toFixed(3) + ')' } }),
            h('svg', { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
              st.micMuted
                ? h('path', { d: 'M3 3l18 18M9 9v3a3 3 0 0 0 4.5 2.6M15 9V5a3 3 0 0 0-5.6-1.5M5 10a7 7 0 0 0 10.5 6.1M12 17v4M8 21h8' })
                : h('g', null,
                  h('rect', { x: 9, y: 2, width: 6, height: 12, rx: 3 }),
                  h('path', { d: 'M5 10a7 7 0 0 0 14 0' }),
                  h('path', { d: 'M12 17v4' }),
                  h('path', { d: 'M8 21h8' })
                )
            )
          )
        ),
        showSubs
          ? h('div', { className: 'vc-lines' },
            visible.length === 0 && !st.partial
              ? h('div', { className: 'vc-empty' }, statusOf(st).label)
              : visible.map(function (line, i) {
                return h('div', { key: i, className: 'vc-line vc-' + line.role },
                  h('span', { className: 'vc-who' }, line.role === 'user' ? t('you') : (line.role === 'tool' ? '' : t('me'))),
                  h('span', { className: 'vc-text' }, line.text)
                )
              }),
            st.partial ? h('div', { className: 'vc-line vc-assistant vc-partial' }, h('span', { className: 'vc-text' }, st.partial)) : null
          )
          : null,
        st.delegations && st.delegations.length
          ? h('div', { className: 'vc-deleg' },
            h('div', { className: 'vc-deleg-head' }, t('delegTitle') + ' · ' + st.delegations.length),
            st.delegationHistory && st.delegationHistory.length
              ? h('div', { className: 'vc-deleg-history' },
                h('div', { className: 'vc-deleg-subhead' }, t('delegHistory')),
                st.delegationHistory.slice(0, 4).map(function (past) {
                  return h('div', { key: 'h-' + past.id, className: 'vc-deleg-row vc-deleg-done' },
                    h('span', { className: 'vc-deleg-id' }, '#' + past.id),
                    h('span', { className: 'vc-deleg-sub' }, String(past.digest || past.text || '').slice(0, 48)),
                    h('button', { type: 'button', className: 'vc-deleg-x', title: t('delegRetry'), onClick: function () { void runtime.ctrl.retryDelegation(past.id) } }, '↻')
                  )
                })
              )
              : null,
            st.delegations.slice(0, 6).map(function (d) {
              var busy = d.status === 'pending' || d.status === 'running'
              return h('div', { key: d.id, className: 'vc-deleg-row vc-deleg-' + String(d.status || 'pending') },
                h('span', { className: 'vc-deleg-dot' }),
                h('span', { className: 'vc-deleg-id' }, '#' + d.id),
                h('span', { className: 'vc-deleg-sub' }, busy ? (d.queued ? t('delegQueued') : t('delegWorking')) : String(d.digest || d.text || '').slice(0, 60)),
                busy ? h('button', { type: 'button', className: 'vc-deleg-x', title: t('delegCancel'), onClick: function () { void runtime.ctrl.cancelDelegation(d.id) } }, '×') : null
              )
            })
          )
          : null,
        st.askPending ? h('div', { className: 'vc-ask' }, '❓ ' + String(st.askPending.question || '')) : null,
        h('div', { className: 'vc-actions' },
          st.busyOwner
            ? h('button', { type: 'button', className: 'vc-btn vc-btn-primary', onClick: function () { runtime.ctrl.takeOver() }, title: t('takeOver') }, t('takeOver'))
            : null,
          !st.call && !st.connecting
            ? h('button', { type: 'button', className: 'vc-btn vc-btn-primary', onClick: function () { runtime.ctrl.start(st.chatSessionId) }, title: t('idleStart') }, t('idleStart'))
            : null,
          h('button', { type: 'button', className: 'vc-btn', onClick: function () { runtime.ctrl.skip() }, title: t('skip') }, t('skip')),
          h('button', { type: 'button', className: 'vc-btn', onClick: function () { runtime.ctrl.interrupt() }, title: t('interrupt') }, t('interrupt')),
          h('button', { type: 'button', className: 'vc-btn', onClick: function () { void runtime.ctrl.recoverMic() }, title: t('micRetry') }, t('micRetry')),
          h('button', { type: 'button', className: 'vc-btn', onClick: function () { runtime.ctrl.resetSession() }, title: t('newSession') }, t('newSession')),
          h('button', { type: 'button', className: 'vc-btn vc-btn-hangup', onClick: hangup }, t('hangup'))
        ),
        st.showSettings ? h(SettingsPanel, { settings: st.settings || {}, voices: st.voices || [], smokeReport: st.smokeReport }) : null,
        st.recordsOpen ? h(RecordsWindow) : null,
        st.lastError ? h('div', { className: 'vc-error' }, st.lastError) : null,
        st.fallback ? h('div', { className: 'vc-warn' }, t('fallbackVoice')) : null
      )
    }

    function fmtWhen(ms) {
      try { return new Date(Number(ms) || Date.now()).toLocaleString(LANG === 'en' ? 'en-US' : 'zh-CN') } catch (e) { return '' }
    }

    function RecordsWindow() {
      var st = useStore(runtime.store)
      if (!st.recordsOpen) return null
      var list = st.recordsList || []
      var filter = String(st.recordsFilter || '').trim().toLowerCase()
      var shown = filter
        ? list.filter(function (it) {
          return String(it.sessionId || '').toLowerCase().indexOf(filter) >= 0 ||
            String(it.preview || '').toLowerCase().indexOf(filter) >= 0
        })
        : list
      var detail = st.recordsDetail

      function close() { try { runtime.ctrl.closeRecords() } catch (e) {} }

      var body = detail
        ? h('div', { className: 'vc-rec-detail' },
          h('div', { className: 'vc-rec-meta' },
            h('span', { className: 'vc-rec-id' }, detail.title || detail.sessionId),
            h('span', { className: 'vc-rec-sub' }, (detail.count || (detail.entries || []).length) + ' ' + t('recordsCount')),
            h('span', { className: 'vc-rec-tools' },
              h('button', {
                type: 'button', className: 'vc-rec-mini', title: t('recordsRename'),
                onClick: function () {
                  var next = window.prompt(t('recordsRenamePrompt'), detail.title || '')
                  if (next) void runtime.ctrl.renameRecord(detail.sessionId, next)
                }
              }, '\u270e'),
              h('button', { type: 'button', className: 'vc-rec-mini', title: t('recordsRegen'), onClick: function () { void runtime.ctrl.regenerateTitle(detail.sessionId) } }, '\u21bb')
            )
          ),
          h('div', { className: 'vc-rec-entries' },
            (detail.entries || []).map(function (e, i) {
              return h('div', { key: i, className: 'vc-rec-entry vc-' + (e.role || 'user') },
                h('div', { className: 'vc-rec-row' },
                  h('span', { className: 'vc-rec-who' }, e.role === 'assistant' ? t('me') : (e.role === 'note' ? '·' : t('you'))),
                  h('span', { className: 'vc-rec-when' }, fmtWhen(e.at)),
                  h('button', {
                    type: 'button', className: 'vc-rec-mini', title: t('recordsPlay'),
                    onClick: function () { runtime.ctrl.playRecordEntry(e.text) }
                  }, st.recordsPlaying === e.text ? '…' : '▶')
                ),
                h('div', { className: 'vc-rec-text' }, String(e.text || ''))
              )
            })
          )
        )
        : h('div', { className: 'vc-rec-list' },
          (function () {
            var hits = st.recordsHits || []
            var q = String(st.recordsFilter || '').trim()
            if (q.length < 2 || !hits.length) return null
            return h('div', { key: 'hits', className: 'vc-rec-hits' },
              h('div', { className: 'vc-sheet-group' }, t('recordsSearchHits') + ' · ' + hits.length),
              hits.map(function (hit, hi) {
                return h('div', { key: 'h' + hi, className: 'vc-rec-hit', onClick: function () { runtime.ctrl.openRecord(hit.sessionId) } },
                  h('div', { className: 'vc-rec-hit-head' }, (hit.title || hit.sessionId) + ' · ' + (hit.role === 'assistant' ? t('roleAssistant') : t('roleUser'))),
                  h('div', { className: 'vc-rec-hit-text' }, hit.text)
                )
              })
            )
          })(),
          shown.length === 0 ? null : h('div', { className: 'vc-sheet-group' }, t('recordsTopic') + ' · ' + shown.length),
          shown.length === 0
            ? h('div', { className: 'vc-empty' }, st.recordsLoading ? t('recordsLoading') : t('recordsEmpty'))
            : shown.map(function (it) {
              return h('div', { key: it.sessionId, className: 'vc-rec-item' },
                h('div', { className: 'vc-rec-main' },
                  h('div', { className: 'vc-rec-title' }, it.title || it.preview || it.sessionId),
                  h('div', { className: 'vc-rec-sub' },
                    fmtWhen(it.updatedAt) + ' · ' + (it.turns || 0) + ' ' + t('recordsTurns') + ' · ' + (it.entries || 0) + ' ' + t('recordsCount'))
                ),
                h('div', { className: 'vc-rec-acts' },
                  h('button', { type: 'button', className: 'vc-rec-mini', onClick: function () { runtime.ctrl.openRecord(it.sessionId) } }, t('recordsOpen')),
                  h('button', { type: 'button', className: 'vc-rec-mini', onClick: function () { runtime.ctrl.exportRecordById(it.sessionId) } }, '⭳'),
                  h('button', { type: 'button', className: 'vc-rec-mini vc-rec-danger', onClick: function () { runtime.ctrl.deleteRecordById(it.sessionId) } }, '🗑')
                )
              )
            })
        )

      return h('div', { className: 'vc-sheet', role: 'dialog' },
        h('div', { className: 'vc-sheet-card' },
          h('div', { className: 'vc-modal-head', onPointerDown: function (ev) { try { runtime.ctrl.beginPanelDrag(ev) } catch (e) {} } },
            detail
              ? h('button', { type: 'button', className: 'vc-rec-mini', onClick: function () { runtime.store.set({ recordsDetail: null }) } }, '← ' + t('recordsBack'))
              : h('span', { className: 'vc-modal-title' }, t('recordsTitle')),
            h('button', { type: 'button', className: 'vc-icon', onClick: close }, '×')
          ),
          detail
            ? null
            : h('input', {
              className: 'vc-rec-search',
              type: 'search',
              placeholder: t('recordsFilter'),
              value: st.recordsFilter || '',
              onChange: function (e) { runtime.ctrl.setRecordsFilter(e.target.value) }
            }),
          body,
          h('div', { className: 'vc-modal-foot' },
            h('span', { className: 'vc-rec-hint' }, st.recordsError || t('recordsHint')),
            h('button', { type: 'button', className: 'vc-btn', onClick: function () { runtime.ctrl.exportAllRecords() } }, t('recordsExportAll')),
            h('button', { type: 'button', className: 'vc-btn', onClick: function () { runtime.ctrl.refreshRecords() } }, '↻'),
            h('button', { type: 'button', className: 'vc-btn vc-rec-danger', onClick: function () { runtime.ctrl.clearAllRecords() } }, t('recordsClear'))
          )
        )
      )
    }

    /* 侧栏入口：点击打开中央「语音记录」页 */
    function volumeValue(v) {
      if (v === undefined || v === null || v === '') return 0
      if (typeof v === 'number') return Math.max(-100, Math.min(100, Math.round(v)))
      var m = /^([+-]?\d+)\s*%$/.exec(String(v))
      if (!m) return 0
      return Math.max(-100, Math.min(100, Number(m[1])))
    }

    function fmtVolume(n) {
      var x = Math.max(-100, Math.min(100, Math.round(Number(n) || 0)))
      return (x > 0 ? '+' : '') + x + '%'
    }

    function fmtPitch(v) {
      var n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.+-]/g, '')) : Number(v)
      if (!isFinite(n)) n = 0
      return (n > 0 ? '+' : '') + Math.round(n) + 'Hz'
    }

    function pitchValue(v) {
      var n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.+-]/g, '')) : Number(v)
      if (!isFinite(n)) n = 0
      return Math.max(-50, Math.min(50, Math.round(n / 2) * 2))
    }

    function SettingsPanel(props) {
      var settings = props.settings || {}
      var voices = props.voices || []
      var zhVoices = voices.filter(function (v) { return /^zh/.test(String(v.locale || v.id || '')) })
      var enVoices = voices.filter(function (v) { return /^en/.test(String(v.locale || v.id || '')) })
      var rest = voices.filter(function (v) { return zhVoices.indexOf(v) < 0 && enVoices.indexOf(v) < 0 })
      var ordered = zhVoices.concat(enVoices, rest)

      function opt(v) {
        return h('option', { key: v.id, value: v.id }, (v.name || v.id) + ' · ' + (v.gender || '') + ' · ' + (v.locale || ''))
      }

      function toggleRow(key, label, fallback) {
        return h('label', { className: 'vc-field vc-field-row' },
          h('input', {
            type: 'checkbox',
            checked: settings[key] === undefined ? fallback : !!settings[key],
            onChange: function (ev) { runtime.ctrl.updateSettings(makePatch(key, ev.target.checked)) }
          }),
          h('span', null, label)
        )
      }

      function makePatch(key, value) {
        var p = {}
        p[key] = value
        return p
      }

      return h('div', { className: 'vc-settings' },
        h('label', { className: 'vc-field' },
          h('span', null, t('voice')),
          h('select', {
            value: settings.voice || 'zh-CN-XiaoxiaoNeural',
            onChange: function (ev) { runtime.ctrl.updateSettings({ voice: ev.target.value }) }
          }, ordered.map(opt))
        ),
        h('label', { className: 'vc-field' },
          h('span', null, t('rate') + ' ' + rateToPercent(settings.rate) + '%'),
          h('input', {
            type: 'range', min: -30, max: 40, step: 5,
            value: rateToPercent(settings.rate),
            onChange: function (ev) { runtime.ctrl.updateSettings({ rate: percentToRate(Number(ev.target.value)) }) }
          })
        ),
        h('label', { className: 'vc-field' },
          h('span', null, t('wakeWord')),
          h('input', {
            type: 'text',
            placeholder: t('wakeWordOff'),
            value: settings.wakeWord || '',
            onChange: function (ev) {
              var v = ev.target.value
              runtime.ctrl.updateSettings({ wakeWord: v, requireWakeWord: !!v })
            }
          })
        ),
        h('label', { className: 'vc-field' },
          h('span', null, t('autoHide')),
          h('select', {
            value: String(settings.orbAutoHideMs === undefined ? 8000 : Number(settings.orbAutoHideMs)),
            onChange: function (ev) { runtime.ctrl.updateSettings({ orbAutoHideMs: Number(ev.target.value) }) }
          },
            [[0, t('autoHideOff')], [6000, '6 秒'], [10000, '10 秒'], [20000, '20 秒'], [40000, '40 秒']].map(function (pair) {
              return h('option', { key: pair[0], value: String(pair[0]) }, pair[1])
            })
          )
        ),
        h('label', { className: 'vc-field' },
          h('span', null, t('sensitivity')),
          h('input', {
            type: 'range', min: 0, max: 100, step: 5,
            value: Math.round((settings.sensitivity === undefined ? 0.5 : Number(settings.sensitivity)) * 100),
            onChange: function (ev) { runtime.ctrl.updateSettings({ sensitivity: Number(ev.target.value) / 100 }) }
          })
        ),
        h('label', { className: 'vc-field' },
          h('span', null, t('volume') + ' · ' + Math.max(0, Math.min(100, 100 + volumeValue(settings.volume))) + '%'),
          h('input', {
            type: 'range', min: 0, max: 100, step: 5,
            value: Math.max(0, Math.min(100, 100 + volumeValue(settings.volume))),
            onChange: function (ev) { runtime.ctrl.updateSettings({ volume: fmtVolume(Number(ev.target.value) - 100) }) }
          })
        ),
        h('label', { className: 'vc-field' },
          h('span', null, t('pitch') + ' · ' + fmtPitch(settings.pitch)),
          h('input', {
            type: 'range', min: -50, max: 50, step: 5,
            value: pitchValue(settings.pitch),
            onChange: function (ev) { runtime.ctrl.updateSettings({ pitch: fmtPitch(Number(ev.target.value)) }) }
          })
        ),
        h('label', { className: 'vc-field' },
          h('span', null, t('language')),
          h('select', {
            value: settings.language || 'auto',
            onChange: function (ev) { runtime.ctrl.updateSettings({ language: ev.target.value }) }
          },
            h('option', { value: 'auto' }, t('langAuto')),
            h('option', { value: 'zh' }, '中文'),
            h('option', { value: 'en' }, 'English')
          )
        ),
        h('label', { className: 'vc-field' },
          h('span', null, '思考深度 · ' + (settings.reasoningEffort || 'default')),
          h('select', {
            value: settings.reasoningEffort || '',
            onChange: function (ev) { runtime.ctrl.updateSettings({ reasoningEffort: ev.target.value }) }
          },
            h('option', { value: '' }, '跟随默认'),
            h('option', { value: 'low' }, 'low'),
            h('option', { value: 'medium' }, 'medium'),
            h('option', { value: 'high' }, 'high')
          )
        ),
        toggleRow('autoStart', t('autoStart'), true),
        toggleRow('autoSend', t('autoSend'), true),
        toggleRow('bargeIn', t('bargeIn'), true),
        toggleRow('chime', t('chime'), true),
        toggleRow('showSubtitles', t('subtitles'), true),
        toggleRow('duckWhileSpeaking', t('duck'), true),
        h('div', { className: 'vc-actions' },
          h('button', { type: 'button', className: 'vc-btn', onClick: function () { runtime.ctrl.resetSession() } }, t('newSession')),
          h('button', { type: 'button', className: 'vc-btn', onClick: function () { runtime.ctrl.clearTranscript() } }, t('clear')),
          h('button', { type: 'button', className: 'vc-btn', onClick: function () { void runtime.ctrl.runSmoke() } }, t('runSmoke'))
        ),
        props.smokeReport ? h('div', { className: 'vc-smoke' }, t('smokeResult') + '：' + props.smokeReport) : null
      )
    }

    /* ------------------------------------------------------------------ */
    /* 样式                                                                 */
    /* ------------------------------------------------------------------ */
    var CSS = [
      '.vc-smoke{font-size:11px;opacity:.78;margin-top:4px}',
      '.vc-deleg{display:flex;flex-direction:column;gap:4px;margin-top:6px;padding:6px 8px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 10%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 26%,transparent);max-height:120px;overflow:auto}',
      '.vc-deleg-head{font-size:11px;opacity:.75}',
      '.vc-deleg-row{display:flex;align-items:center;gap:6px;font-size:11px;line-height:1.35}',
      '.vc-deleg-history{margin-top:6px;border-top:1px dashed var(--dsw-alias-border-l2,rgba(255,255,255,.12));padding-top:6px}',
      '.vc-deleg-subhead{font-size:11px;opacity:.62;margin-bottom:4px}',
      '.vc-deleg-done .vc-deleg-id{opacity:.7}',
      '.vc-deleg-dot{width:6px;height:6px;border-radius:999px;flex:0 0 auto;background:var(--dsw-alias-label-tertiary,#8b8f99)}',
      '.vc-deleg-pending .vc-deleg-dot,.vc-deleg-running .vc-deleg-dot{background:var(--dsw-alias-brand-primary,#4f8ef7)}',
      '.vc-deleg-done .vc-deleg-dot{background:var(--dsw-alias-state-success-primary,#3fbf6f)}',
      '.vc-deleg-failed .vc-deleg-dot{background:var(--dsw-alias-state-error-primary,#ec5b5b)}',
      '.vc-deleg-id{font-family:ui-monospace,monospace;opacity:.7;flex:0 0 auto}',
      '.vc-deleg-sub{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.vc-deleg-x{flex:0 0 auto;width:18px;height:18px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.18));background:transparent;color:inherit;cursor:pointer;line-height:1;padding:0}',
      '.vc-rec-tools{display:flex;gap:4px;margin-left:auto}',
      '.vc-dock{position:fixed;left:0;top:0;width:0;height:0;z-index:59;touch-action:none;user-select:none}',
      '.vc-dock-body{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;will-change:transform}',
      '.vc-dock-hint{position:absolute;right:calc(100% + 10px);top:50%;bottom:auto;left:auto;transform:translateY(-50%);max-width:150px;padding:3px 8px;border-radius:999px;font-size:11px;line-height:1.3;text-align:right;color:var(--dsw-alias-label-secondary,#a9adb3);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#232327) 82%,transparent);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));backdrop-filter:blur(8px);opacity:0;transition:opacity .18s ease;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.vc-dock-hint-live{opacity:1}',
      '.vc-dock-hint-muted{color:var(--dsw-alias-label-secondary,#a9adb3);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ec5b5b) 34%,transparent)}',
      '.vc-dock-orb{position:relative;z-index:2;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 20%,transparent);color:var(--dsw-alias-label-primary,#f2f2f4);box-shadow:0 10px 26px -10px rgba(0,0,0,.55);backdrop-filter:blur(10px);transition:background .16s ease,transform .16s ease}',
      '.vc-dock-expanded .vc-dock-orb:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 34%,transparent)}',
      '.vc-dock-on{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 40%,transparent)}',
      '.vc-dock-speaking{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 58%,transparent)}',
      '.vc-dock-needs{background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#e0a333) 34%,transparent)}',
      '.vc-dock-dragging{transition:none}',
      '.vc-dock-dragging .vc-dock-orb{transform:scale(.96);cursor:grabbing}',
      '.vc-dock.vc-dock-collapsed{right:auto;bottom:auto}',
      '.vc-dock-tab::after,.vc-dock-tab::before{content:none!important;display:none!important;background:none!important;box-shadow:none!important}',
      '.vc-dock-tab{position:relative;display:block;width:28px;height:58px;padding:0;cursor:pointer;background:none;border:0;overflow:visible;outline:none;user-select:none;-webkit-user-select:none}',
      '.vc-dock-tab:hover,.vc-dock-tab:focus,.vc-dock-tab:active{background:none}',
      '.vc-dock-tab,.vc-dock-tab:hover,.vc-dock-tab:focus,.vc-dock-tab:active{-webkit-tap-highlight-color:transparent;outline:none;transform:none!important;filter:none!important}',
      '.vc-dock-puck{position:absolute;top:1px;left:0;display:block;width:56px;height:56px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#232327) 72%,transparent);backdrop-filter:blur(14px) saturate(150%);box-shadow:0 6px 20px -12px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.18);transition:background .18s ease,box-shadow .18s ease}',
      '.vc-dock-collapsed .vc-dock-puck,.vc-dock-collapsed:hover .vc-dock-puck,.vc-dock-collapsed .vc-dock-tab:hover .vc-dock-puck,.vc-dock-tab:hover .vc-dock-puck{transform:none!important;width:56px!important;height:56px!important;border-radius:50%!important;box-shadow:0 6px 20px -12px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.18)!important;transition:none!important}',
      '.vc-dock-collapsed .vc-dock-tab:not(.vc-dock-tab-muted) .vc-dock-puck{filter:none!important}',
      '.vc-dock-collapsed .vc-dock-tab .vc-dock-puck-icon,.vc-dock-collapsed .vc-dock-tab .vc-dock-tab-icon{transform:none!important;color:var(--dsw-alias-label-secondary,#eef2f8)}',
      '.vc-dock-tab-on .vc-dock-puck{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 40%,transparent)}',
      '.vc-dock-tab-speaking .vc-dock-puck{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 58%,transparent)}',
      '.vc-dock-tab-muted .vc-dock-puck{filter:grayscale(.65);opacity:.86}',
      '.vc-dock-puck-icon{position:absolute;top:0;left:0;width:28px;height:56px;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#eef2f8);pointer-events:none}',
      '.vc-dock-tab-icon{display:block}',
      '.vc-dock-edge-left .vc-dock-puck{left:auto;right:0}',
      '.vc-dock-edge-left .vc-dock-puck-icon{left:auto;right:0}',
      '.vc-dock-edge-left .vc-dock-hint{right:auto;left:calc(100% + 10px);text-align:left}',
      '.vc-dock-edge-top .vc-dock-hint{right:auto;left:50%;top:calc(100% + 10px);bottom:auto;transform:translateX(-50%);text-align:center}',
      '.vc-dock-edge-bottom .vc-dock-hint{right:auto;left:50%;bottom:calc(100% + 10px);top:auto;transform:translateX(-50%);text-align:center}',
      '.vc-dock-edge-top .vc-fan{top:calc(100% + 10px);bottom:auto}',
      '.vc-dock-edge-bottom .vc-fan{bottom:calc(100% + 10px);top:auto}',
      '.vc-dock-meter{display:flex;align-items:flex-end;justify-content:center;gap:3px;height:38px}',
      '.vc-dock-meter-bar{width:3px;height:100%;border-radius:999px;background:currentColor;transform-origin:50% 100%;transition:transform .12s ease,opacity .12s ease}',
      '.vc-dock-tab-speaking .vc-dock-meter-bar{background:var(--dsw-alias-brand-primary,#4f8ef7)}',
      '.vc-fan{position:absolute;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:4}',
      '.vc-fan-btn{width:38px;height:38px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.18));background:var(--dsw-alias-bg-layer-2,rgba(30,32,38,.94));color:var(--dsw-alias-label-primary,#f3f5f9);box-shadow:0 8px 22px rgba(0,0,0,.32);animation:vc-fan-in .18s ease both;transition:background .16s ease,color .16s ease,transform .16s ease}',
      '.vc-fan-btn:hover{background:var(--dsw-alias-brand-primary,#4f8ef7);color:#fff;transform:translateY(-1px)}',
      '.vc-fan-btn-off{color:var(--dsw-alias-state-error-primary,#ec5b5b)}',
      '.vc-fan-btn-idle{color:var(--dsw-alias-label-tertiary,#8b8f99)}',
      '.vc-fan-btn-live{color:var(--dsw-alias-state-success-primary,#2dbd6e)}',
      '@keyframes vc-fan-in{from{opacity:0;transform:translateY(8px) scale(.84)}to{opacity:1;transform:none}}',
      '.vc-dock-tab-on{color:var(--dsw-alias-label-secondary,#c2c7d0)}',
      '.vc-dock-tab-speaking{color:var(--dsw-alias-label-secondary,#c2c7d0)}',
      '.vc-dock-tab-muted{color:var(--dsw-alias-label-tertiary,#9aa0ad)}',
      '.vc-dock-ring{position:absolute;inset:-7px;border-radius:50%;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 55%,transparent);transition:transform .08s linear,opacity .08s linear;pointer-events:none}',
      '.vc-dock-badge-idle{background:var(--dsw-alias-label-tertiary,#8b8f99)!important}',
      '.vc-dock-badge-ok{background:var(--dsw-alias-state-success-primary,#2dbd6e)!important}',
      '.vc-dock-badge-error{background:var(--dsw-alias-state-error-primary,#ec1313)!important}',
      '.vc-dock-badge-warn{background:var(--dsw-alias-state-warning-primary,#e0a333)!important}',
      '.vc-dock-badge-brand{background:var(--dsw-alias-brand-primary,#4f8ef7)!important}',
      '.vc-dock-tab-idle .vc-dock-puck{filter:grayscale(.45);opacity:.9}',
      '.vc-dock-badge{position:absolute;right:2px;bottom:2px;width:10px;height:10px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#2dbd6e);border:2px solid var(--dsw-alias-bg-layer-2,#1b1b1f)}',
      '.vc-dock-badge[data-phase="thinking"]{background:var(--dsw-alias-state-warning-primary,#e0a333)}',
      '.vc-dock-badge[data-phase="speaking"]{background:var(--dsw-alias-brand-primary,#4f8ef7)}',
      '.vc-dock-muted{color:var(--dsw-alias-label-secondary,#b9bcc4)}',
      '.vc-dock-muted .vc-dock-ring{opacity:.08!important;transform:none!important}',
      '.vc-dock-badge-muted{background:var(--dsw-alias-state-error-primary,#ec1313)!important}',
      '.vc-hidden{display:none!important}',
      '.vc-sheet .vc-modal-head{cursor:move;touch-action:none}',
      '.vc-panel .vc-head{cursor:move;touch-action:none}',
      '.vc-sheet{position:absolute;inset:6px;z-index:9;display:flex;border-radius:16px;overflow:hidden;background:var(--dsw-alias-bg-layer-1,rgba(20,21,26,.97));border:1px solid var(--dsw-alias-line-1,rgba(255,255,255,.14));box-shadow:0 18px 48px rgba(0,0,0,.42)}',
      '.vc-sheet-card{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;overflow:hidden}',
      '.vc-rec-detail{display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-height:0;overflow:hidden}',
      '.vc-sheet-group{padding:8px 12px 4px;font-size:11px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary,#9aa0ad)}',
      '.vc-dock-unread{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-state-error-primary,#ec1313);color:#fff;font-size:10px;line-height:16px;text-align:center}',
      '.vc-dock-stack{position:relative;display:flex;align-items:center;justify-content:center;transform-origin:100% 50%;transition:transform .38s cubic-bezier(.34,1.48,.52,1)}',
      '.vc-dock-collapsed .vc-dock-stack{transform:translateX(56px) scale(.76)}',
      '.vc-dock-collapsed .vc-dock-orb{opacity:.74}',
      '.vc-dock-collapsed .vc-dock-orb,.vc-dock-collapsed .vc-dock-expand{transition:opacity .3s ease,color .3s ease,background .3s ease,transform .38s cubic-bezier(.34,1.48,.52,1)}',
      '.vc-dock-collapsed .vc-dock-expand{cursor:pointer}',
      '.vc-dock-collapsed .vc-dock-hint,.vc-dock-collapsed:hover .vc-dock-hint{opacity:0!important}',
      '.vc-dock-collapsed .vc-dock-ring{opacity:.12!important;transform:none!important}',
      '.vc-dock-expand{position:absolute;z-index:3;left:-13px;top:50%;margin-top:-18px;width:16px;height:36px;padding:0;border-radius:9px 13px 13px 9px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--dsw-alias-label-primary,#eef1f6);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#232327) 72%,color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 34%,transparent));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.22));border-right:0;box-shadow:-3px 0 10px -8px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.08);opacity:.94;transition:opacity .14s ease,color .14s ease,background .14s ease,transform .38s cubic-bezier(.34,1.48,.52,1)}',
      '.vc-dock-expanded .vc-dock-expand{opacity:1}',
      '.vc-dock-expanded .vc-dock-expand:hover{color:var(--dsw-alias-brand-primary,#4f8ef7);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 26%,transparent)}',
      '.vc-panel{position:fixed;right:24px;bottom:96px;z-index:60;width:340px;max-height:min(70vh,560px);display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));background:var(--dsw-alias-bg-layer-2,#232327);color:var(--dsw-alias-label-primary,#f2f2f4);box-shadow:0 18px 44px -12px rgba(0,0,0,.55);backdrop-filter:blur(14px);font-size:13px;line-height:1.45}',
      '.vc-head{display:flex;align-items:center;gap:8px;cursor:grab;user-select:none;touch-action:none}',
      '.vc-head:active{cursor:grabbing}',
      '.vc-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#81858c);flex:0 0 auto}',
      '.vc-dot[data-phase="idle"]{background:var(--dsw-alias-label-tertiary,#81858c)}',
      '.vc-dot[data-phase="needs"]{background:var(--dsw-alias-state-warning-primary,#e0a333)}',
      '.vc-dot[data-phase="muted"]{background:var(--dsw-alias-state-error-primary,#ec5b5b)}',
      '.vc-dot[data-phase="listening"]{background:var(--dsw-alias-state-success-primary,#2dbd6e)}',
      '.vc-dot[data-phase="thinking"]{background:var(--dsw-alias-state-warning-primary,#e0a333)}',
      '.vc-dot[data-phase="speaking"]{background:var(--dsw-alias-brand-primary,#4f8ef7);animation:vc-blink 1.1s ease-in-out infinite}',
      '@keyframes vc-blink{0%,100%{opacity:1}50%{opacity:.35}}',
      '.vc-title{font-weight:600}',
      '.vc-topic{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-secondary,#9aa0ad)}',
      '.vc-rec-hits{padding:2px 8px 6px}',
      '.vc-rec-hit{padding:6px 8px;border-radius:8px;cursor:pointer}',
      '.vc-rec-hit:hover{background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06))}',
      '.vc-rec-hit-head{font-size:11px;color:var(--dsw-alias-label-secondary,#9aa0ad)}',
      '.vc-rec-hit-text{font-size:12px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.vc-usage{font-size:10px;padding:1px 5px;border-radius:999px;color:var(--dsw-alias-label-secondary,#9aa0ad);background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.08))}',
      '.vc-phase{flex:1 1 auto;color:var(--dsw-alias-label-secondary,#a9adb3);font-size:12px}',
      '.vc-icon{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#a9adb3);cursor:pointer;font-size:16px;line-height:1}',
      '.vc-icon:hover{background:var(--dsw-alias-interactive-bg-hover-accent,rgba(127,127,127,.2));color:var(--dsw-alias-label-primary,#fff)}',
      '.vc-warn{padding:6px 8px;border-radius:8px;font-size:12px;background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#e0a333) 16%,transparent);color:var(--dsw-alias-label-primary,#f2f2f4)}',
      '.vc-orb-wrap{display:flex;justify-content:center;padding:4px 0 2px}',
      '.vc-orb{position:relative;display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 22%,transparent);color:var(--dsw-alias-label-primary,#fff);cursor:pointer;transition:background .16s ease}',
      '.vc-orb-speaking{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 42%,transparent)}',
      '.vc-orb-muted{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ec1313) 26%,transparent)}',
      '.vc-orb-pulse{position:absolute;inset:-6px;border-radius:50%;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 55%,transparent);transition:transform .08s linear,opacity .08s linear;pointer-events:none}',
      '.vc-lines{flex:1 1 auto;min-height:64px;max-height:190px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:4px 2px}',
      '.vc-empty{color:var(--dsw-alias-label-tertiary,#81858c);font-size:12px;text-align:center;padding:18px 0}',
      '.vc-line{display:flex;gap:6px;align-items:flex-start}',
      '.vc-who{flex:0 0 auto;font-size:11px;color:var(--dsw-alias-label-tertiary,#81858c);padding-top:1px;min-width:22px}',
      '.vc-text{white-space:pre-wrap;word-break:break-word}',
      '.vc-user .vc-text{color:var(--dsw-alias-label-primary,#f2f2f4)}',
      '.vc-assistant .vc-text{color:var(--dsw-alias-label-secondary,#cfd3d6)}',
      '.vc-tool .vc-text{color:var(--dsw-alias-label-tertiary,#81858c);font-size:12px}',
      '.vc-partial .vc-text{opacity:.55}',
      '.vc-btn-primary{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 30%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 55%,transparent);color:var(--dsw-alias-label-primary,#f2f2f4)!important}',
      '.vc-actions{display:flex;gap:6px;flex-wrap:wrap}',
      '.vc-ask{margin:4px 2px;padding:7px 9px;border-radius:10px;font-size:12.5px;line-height:1.45;color:var(--dsw-alias-label-primary,#e8edf6);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 18%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 42%,transparent)}',
      '.vc-btn{flex:1 1 auto;padding:6px 8px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#f2f2f4);font-size:12px;cursor:pointer}',
      '.vc-btn:hover{background:var(--dsw-alias-interactive-bg-hover-accent,rgba(127,127,127,.26))}',
      '.vc-btn-hangup{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ec1313) 20%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ec1313) 38%,transparent)}',
      '.vc-settings{display:flex;flex-direction:column;gap:8px;padding:8px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#232327) 60%,transparent);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));max-height:240px;overflow-y:auto}',
      '.vc-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dsw-alias-label-secondary,#cfd3d6)}',
      '.vc-field-row{flex-direction:row;align-items:center;gap:8px}',
      '.vc-field select,.vc-field input[type="text"]{width:100%;padding:5px 7px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));background:var(--dsw-alias-bg-base,#1b1b1f);color:var(--dsw-alias-label-primary,#f2f2f4);font-size:12px}',
      '.vc-field input[type="range"]{width:100%}',
      '.vc-error{padding:6px 8px;border-radius:8px;font-size:12px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ec1313) 16%,transparent);color:var(--dsw-alias-label-primary,#f2f2f4)}',
      '.vc-modal{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-bg-base,#000) 45%,transparent);backdrop-filter:blur(2px);padding:24px}',
      '.vc-modal-card{width:min(680px,92vw);max-height:min(76vh,720px);display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:16px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#232327) 94%,var(--dsw-alias-bg-base,#000));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));box-shadow:0 24px 64px rgba(0,0,0,.45);color:var(--dsw-alias-label-primary,#f2f2f4);font-size:13px}',
      '.vc-modal-head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.vc-modal-title{font-size:14px;font-weight:600}',
      '.vc-modal-foot{display:flex;align-items:center;gap:8px;padding-top:6px;border-top:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08))}',
      '.vc-stat{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.05))}',
      '.vc-stat-n{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#f2f2f4)}',
      '.vc-stat-l{font-size:10px;color:var(--dsw-alias-label-secondary,#cfd3d6)}',
      '.vc-side-entry{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#f2f2f4);font-size:12px;cursor:pointer}',
      '.vc-side-entry:hover{background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06))}',
      '.vc-side-ico{font-size:13px;line-height:1}',
      '.vc-side-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.vc-rec-hint{flex:1 1 auto;font-size:11px;color:var(--dsw-alias-label-secondary,#cfd3d6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.vc-rec-search{width:100%;padding:6px 9px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));background:var(--dsw-alias-bg-base,#1b1b1f);color:var(--dsw-alias-label-primary,#f2f2f4);font-size:12px}',
      '.vc-rec-list,.vc-rec-entries{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:6px;padding-right:2px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-label-secondary,rgba(255,255,255,.34)) transparent}',
      '.vc-rec-list::-webkit-scrollbar,.vc-rec-entries::-webkit-scrollbar{width:8px}',
      '.vc-rec-list::-webkit-scrollbar-thumb,.vc-rec-entries::-webkit-scrollbar-thumb{background:var(--dsw-alias-label-secondary,rgba(255,255,255,.34));border-radius:999px;border:2px solid transparent;background-clip:content-box}',
      '.vc-rec-list::-webkit-scrollbar-track,.vc-rec-entries::-webkit-scrollbar-track{background:transparent}',
      '.vc-rec-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-bg-base,#1b1b1f) 70%,transparent);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08))}',
      '.vc-rec-main{flex:1 1 auto;min-width:0}',
      '.vc-rec-title{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.vc-rec-sub{font-size:11px;color:var(--dsw-alias-label-secondary,#cfd3d6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.vc-conv-head{display:flex;align-items:flex-start;gap:10px;padding:12px 14px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1))}',
      '.vc-conv-title-wrap{flex:1 1 auto;min-width:0}',
      '.vc-conv-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#f2f2f4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.vc-conv-meta{margin-top:3px;font-size:11px;color:var(--dsw-alias-label-secondary,#cfd3d6);opacity:.8}',
      '.vc-conv-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto}',
      '.vc-conv-body{display:flex;flex-direction:column;gap:10px;padding:12px 14px 18px;overflow:auto;min-height:240px;flex:1 1 auto}',
      '.vc-conv-search{position:sticky;top:0;z-index:1;padding-bottom:6px;background:var(--dsw-alias-bg-base,transparent)}',
      '.vc-msg{display:flex;gap:8px;align-items:flex-start;max-width:100%}',
      '.vc-msg-user{flex-direction:row-reverse}',
      '.vc-msg-avatar{flex:0 0 auto;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#f9fafb) 16%,transparent);color:var(--dsw-alias-label-primary,#f2f2f4)}',
      '.vc-msg-main{display:flex;flex-direction:column;gap:3px;min-width:0;max-width:78%}',
      '.vc-msg-meta{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--dsw-alias-label-secondary,#cfd3d6);opacity:.85}',
      '.vc-msg-user .vc-msg-meta{justify-content:flex-end}',
      '.vc-msg-text{padding:8px 11px;border-radius:12px;font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(255,255,255,.08)) 88%,transparent);color:var(--dsw-alias-label-primary,#f2f2f4)}',
      '.vc-msg-user .vc-msg-text{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#f9fafb) 20%,transparent)}',
      '.vc-msg-tool .vc-msg-text{font-size:11.5px;opacity:.75;font-family:ui-monospace,Menlo,Consolas,monospace}',
      '.vc-msg-tail{height:1px}',
      '.vc-rec-acts{display:flex;gap:4px;flex:0 0 auto}',
      '.vc-rec-mini{padding:3px 7px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));background:transparent;color:var(--dsw-alias-label-primary,#f2f2f4);font-size:11px;cursor:pointer}',
      '.vc-rec-mini:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#f9fafb) 12%,transparent)}',
      '.vc-rec-danger:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ec1313) 22%,transparent)}',
      '.vc-rec-meta{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary,#cfd3d6)}',
      '.vc-rec-id{font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.vc-rec-entry{padding:7px 9px;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-bg-base,#1b1b1f) 60%,transparent);border-left:2px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12))}',
      '.vc-rec-entry.vc-assistant{border-left-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#f9fafb) 55%,transparent)}',
      '.vc-rec-row{display:flex;align-items:center;gap:8px;margin-bottom:3px}',
      '.vc-rec-who{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#cfd3d6)}',
      '.vc-rec-when{flex:1 1 auto;font-size:10.5px;color:var(--dsw-alias-label-secondary,#cfd3d6);opacity:.75}',
      '.vc-rec-text{font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word}',
      '@media (prefers-reduced-motion: reduce){.vc-dot[data-phase="speaking"]{animation:none}.vc-dock-ring,.vc-orb-pulse{transition:none}}'
    ].join('\n')

    /* ------------------------------------------------------------------ */
    /* 注册                                                                 */
    /* ------------------------------------------------------------------ */
    /* 无渲染的桥接组件：只为拿到会话作用域的 props（inputActions / sessionId），
       悬浮球本身挂在 root overlay 上，拿不到这些。 */
    function PropsBridge(props) {
      useEffect(function () {
        try {
          if (!runtime.ctrl) return
          if (props.inputActions) runtime.ctrl.setInputActions(props.inputActions)
          if (props.sessionId) runtime.ctrl.setChatSession(props.sessionId)
        } catch (e) {}
      }, [props.inputActions, props.sessionId])
      return null
    }

    /* 侧栏「语音记录」页签：插入官方 WorkspaceBrowser 的原生页签注册表，
       与「任务 / 频道」同排；注册表不可用时退回 DOM 注入。 */
    function reportTag(tag, data) {
      try {
        fetch(BASE + '/debug', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tag: tag, data: data })
        })['catch'](function () {})
      } catch (e) {}
    }

    function registerSlots(ctx) {
      try {
        ctx.slots.inject('conversation.input.right', function () {
          var dispose = ctx.slots.register({
            name: 'conversation.input.right',
            id: 'voice-companion-bridge',
            order: 41
          }, PropsBridge)
          return function () { try { if (dispose) dispose() } catch (e) {} }
        })
      } catch (e) {
        try { console.warn('[voice-companion] bridge slot failed', e) } catch (e2) {}
      }
      try {
        ctx.slots.inject('shell.overlay', function () {
          var disposeDock = ctx.slots.register({ name: 'shell.overlay', id: 'voice-companion-dock', order: 99 }, OrbDock)
          var disposePanel = ctx.slots.register({ name: 'shell.overlay', id: 'voice-companion-panel', order: 100 }, CallPanel)
          var disposeRecords = null /* 记录管理改为侧栏页签 + 中央整页 */
          return function () {
            try { if (disposeDock) disposeDock() } catch (e) {}
            try { if (disposePanel) disposePanel() } catch (e) {}
            try { if (disposeRecords) disposeRecords() } catch (e) {}
          }
        })
      } catch (e) {
        try { console.warn('[voice-companion] overlay slot failed', e) } catch (e2) {}
      }
    }

    return {
      inject: ['slots'],
      apply: function (ctx) {
        runtime.ctx = ctx
        // 清理历史版本遗留的贴边引导条（蓝色竖线）节点
        try {
          if (typeof document !== 'undefined' && document && document.querySelectorAll) {
            var stale = document.querySelectorAll('.vc-snap-guide, .vc-guide, .vc-dock-guide')
            for (var si = 0; si < stale.length; si += 1) {
              try { stale[si].parentNode && stale[si].parentNode.removeChild(stale[si]) } catch (e2) {}
            }
          }
        } catch (e) {}
        try { if (ctx.styles && typeof ctx.styles.insert === 'function') ctx.styles.insert(CSS) } catch (e) {}
        try { if (typeof document !== 'undefined' && document && document.head) { var el = document.createElement('style'); el.setAttribute('data-vc', '1'); el.textContent = CSS; document.head.appendChild(el) } } catch (e) {}
        try {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            ctx.locale.register(NS, { zh: STRINGS.zh, en: STRINGS.en })
          }
        } catch (e) {}
        var store = createStore(INITIAL)
        var ctrl = createController(ctx, store)
        runtime.store = store
        runtime.ctrl = ctrl
        try {
          ctx.effect(function () {
            return function () { try { ctrl.dispose() } catch (e) {} }
          })
        } catch (e) {}
        try {
          var onKey = function (ev) {
            try {
              if (ev.key === ' ' && ev.ctrlKey && ev.shiftKey) {
                ev.preventDefault()
                if (store.get().panelOpen) ctrl.openPanel(false)
                else ctrl.openPanel(true)
              } else if (ev.key === 'Escape' && store.get().panelOpen) {
                ctrl.openPanel(false)
              }
            } catch (e) {}
          }
          window.addEventListener('keydown', onKey, true)
          var off = function () { try { window.removeEventListener('keydown', onKey, true) } catch (e) {} }
          try { ctx.effect(function () { return off }) } catch (e) { void 0 }
        } catch (e) {}
        // 自动收起：每 500ms 检查一次（条件解除后才开始倒计时）
        try {
          var orbTimer = setInterval(function () { try { ctrl.tickOrbHide() } catch (e) {} }, 500)
          var micTimer = setInterval(function () { try { ctrl.tickMic() } catch (e) {} }, 4000)
          var onVisible = function () {
            try { if (document.visibilityState === 'visible') ctrl.tickMic() } catch (e) {}
          }
          document.addEventListener('visibilitychange', onVisible)
          // 点到悬浮球 / 卡片之外任何位置 → 立刻收起
          var onOutside = function (ev) {
            try {
              var node = ev.target
              if (!node || typeof node.closest !== 'function') return
              if (node.closest('.vc-dock') || node.closest('.vc-panel')) return
              ctrl.hideOrbNow('outside')
            } catch (e) {}
          }
          document.addEventListener('pointerdown', onOutside, true)
          var orbOff = function () {
            try { clearInterval(orbTimer) } catch (e) {}
            try { clearInterval(micTimer) } catch (e) {}
            try { document.removeEventListener('pointerdown', onOutside, true) } catch (e) {}
            try { document.removeEventListener('visibilitychange', onVisible) } catch (e) {}
          }
          try { ctx.effect(function () { return orbOff }) } catch (e) { void 0 }
        } catch (e) {}

        registerSlots(ctx)
        try { void ctrl.bootstrap() } catch (e) {}
      }
    }
  }
})
