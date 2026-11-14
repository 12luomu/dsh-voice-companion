# v59 变更摘要（追加）：打断快速通道（ambient 自适应 + 首帧判定）、唤醒词 1 字容错、委托完成写入面板字幕。

# 语音伙伴（dsh-voice-companion）实现笔记

> 目的：任何人（或下一个接手的模型）读完这一页就能改代码。**只写现在成立的东西**，历史过程见 `voice-companion/CHANGELOG.md`，早期设计稿 `docs/VOICE-COMPANION-SPEC.md` 已过期。

当前版本：`0.1.26` / build `v54`。宿主 GUI 端口随时会变（重启后），验证时以 `/health` 能应答的端口为准。

## 1. 它是怎么拼起来的

```
宿主半 index.js（每个 DSH 进程一个实例）
├─ settings.js     设置读写（JSON 落盘，逐字段 normalize）
├─ segmenter.js    Markdown → 可朗读句子（去代码/表格/URL，≤220 字）
├─ tts.js          Edge TTS 队列（msedge-tts vendor，12s 超时，失败重试 1 次，缓存 60 条/5 分钟）
├─ asr.js          speechToText 服务封装（SenseVoice，本地零 Key，需要整段 WAV）
├─ hub.js          SSE 订阅中心（广播 / 状态节流 100ms / 心跳 15s / 按 tabId 去重）
├─ uichannel.js    宿主 → 浏览器「指令通道」（广播 ui 事件 + 等 /ui-ack 回执，超时 8s）
├─ relay.js        委托（语音让主对话干活）：累积回合文本 → 摘要 → 回调播报
├─ records.js      语音记录（自建 jsonl，软删除进 trash，启动时 sanitize+prune）
├─ housekeeping.js 清理 >24h 的 session-voice-* 会话目录
├─ debuglog.js     client.log 环形日志（256KB 轮转），/debug 可读
└─ tools.js        21 个 voice_* 工具（注册进 ctx.tools，全局可见）

客户端半 client.js（浏览器模块，window.__ModuleLoader__.load）
├─ 悬浮球 OrbDock   shell.overlay / id voice-companion-dock(99)：收起=贴边半圆 puck，展开=球+扇出三按钮
├─ 通话卡片 CallPanel shell.overlay / id voice-companion-panel(100)：状态点、字幕、动作条、设置、历史 sheet
├─ PropsBridge      conversation.input.right / id voice-companion-bridge(41)：只用来拿 inputActions/sessionId
├─ 录音链 createMic  ScriptProcessor 环形缓冲 → VAD → 16k WAV → base64 → POST /asr
├─ 播放链 createPlayer /audio/:id → decodeAudioData → BufferSource → Gain（可 duck）
└─ createController 状态机 + SSE 事件处理 + 所有控制器方法（API 挂在 runtime.ctrl）
```

## 2. 必须记住的不变量（破了就会出玄学 bug）

1. **页面只能有一条 SSE**。`openEvents()` 开新连接前先关旧连接；宿主 `hub.attach(res, tabId)` 也会顶掉同 tabId 的旧连接。违背后果：同一条回复被处理两次（字幕/记录/朗读全重复）——这个 bug 已经踩过一次。
2. **宿主的 `CLIENT_BUILD` 与 `client.js` 的 `CLIENT_BUILD` 必须同步**。不一致会触发客户端自动刷新（最多 2 次），再不一致就只在面板顶部提示手动强刷。
3. **改文件必须原子写**：先写临时文件再 `os.replace`。非原子写会让宿主在写入中途 import 到半截文件 → `web boot: import failed` → **DSH 整个崩溃重启**（踩过三次）。
4. **`llm` / `sessions` / `agents` / `tools` / `webServer` 一律用 `ctx.get('x')` 或 `ctx.inject([...])`**；直接 `ctx.x` 会抛 `cannot get property "x" without inject`（而且常常被 try/catch 吞掉，表现为「没反应」）。
5. **客户端模块的 `inject` 只写确定存在的服务**。多写一个不存在的服务会让整个客户端模块静默不加载 → 悬浮球消失（踩过）。
6. **任何监听都要能被清理**：`ctx.effect(() => dispose)`；客户端 setInterval / addEventListener 在 `apply()` 的 cleanup 里收掉。
7. **破坏性工具必须 `confirm:true`**（退出 DSH / 删记录 / 清记录 / 归档会话），未确认返回 `need-confirm`，要求先用 `voice_ask` 征得同意。
8. **写记录只写 user/assistant 两种角色**（工具行不落盘）；同角色同文本 4 秒内视为重复不写。

## 3. 宿主路由（前缀 `/voice-companion`）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/state` | 全量状态（enabled/phase/sessionId/voiceSessionId/chatSessionId/asr/tts/settings/turns） |
| GET | `/health` | tts/asr 就绪、lastMs、clients 数 |
| GET | `/build` | 宿主侧 `CLIENT_BUILD`，客户端用它做版本自检 |
| GET | `/events?tabId=` | SSE 长连接（常驻，挂断也不关） |
| GET | `/voices` | Edge 音色列表（1 小时缓存，失败回退内置 14 个中文音色） |
| GET/POST | `/settings` | 读/合并设置 |
| POST | `/start` `/stop` | 开/关通话，`/start` 会创建或复用语音会话 |
| GET/POST | `/session` | 查看；`{reset:true}` = 新话题（换新 agent+会话，旧 agent dispose） |
| POST | `/asr` | `{wavBase64, durationMs, language?}` → `{text, audioSeconds, inferenceSeconds}` |
| POST | `/speak` `/skip` `/interrupt` | 单独朗读一句 / 跳过 / 打断 |
| GET | `/audio/:id` | TTS 音频（MP3） |
| GET/POST | `/records`，`/records/<id>`，`/records/<id>/export`，`/records/<id>/title`，`/records/<id>/delete`，`/records/clear` | 语音记录 CRUD + 导出 md + 话题名 |
| GET/POST | `/delegate`，`/delegate/test`，`/delegations`，`/delegations/cancel` | 委托给主对话 + 自检 + 列表 + 取消 |
| POST/GET | `/ask/answer`，`/asks` | 反向回问（语音替主对话问用户） |
| GET | `/context` | 情境快照（语音侧 + 前台对话） |
| POST | `/ui-ack` | 客户端回执 UI 指令 |
| POST | `/smoke`，`/smoke-result`，`GET /smoke-results` | 真实页面冒烟自检 |
| GET/POST | `/debug` | 读写诊断日志 |
| POST | `/quit` | 退出 DSH（需口头确认） |

所有 POST 要求 `content-type: application/json`；非 loopback 拒绝；跨站 Origin / `sec-fetch-site: cross-site` 拒绝。

## 4. 事件（SSE 名称）

`hello`、`state`（100ms 节流）、`turn`（thinking/speaking/done + turn 号）、`delta`（流式文本）、`sentence`（含 id/url/text/index/turn，客户端按 id 去重）、`speech-end`、`tool`、`transcript`（宿主侧注入的用户文本）、`note`、`ui`（导航指令）、`ask`（回问）、`delegate`（委托状态变化）、`smoke`（触发页面自检）、`closed`（同 tabId 被新连接顶掉）。

## 5. 数据落在哪

- 设置：`DSH_HOME/voice-companion/settings.json`
- 记录：`DSH_HOME/voice-companion/records/<sessionId>.jsonl`，话题名 `<sessionId>.title.json`，软删除进 `records/trash/`
- 语音会话工作目录：`DSH_HOME/voice-companion/space`（中立目录，切对话不再重建会话）
- 日志：`DSH_HOME/voice-companion/client.log`（256KB 轮转）、`tts-diag.log`
- 语音会话目录：`DSH_HOME/sessions/**/session-voice-*`（启动 5s 后清 >24h 的）

## 6. 状态模型（唯一真源：`statusOf(st)`）

优先级：`needsGesture`（需要点一下页面）> 待机 `idle` > 已静音 `muted` > 思考 `thinking` > 朗读 `speaking` > 聆听 `listening`。
悬浮球气泡、角标、卡片状态点/标题/空态**全部走它**，新增状态只改这一处。

## 7. 踩过的坑（改代码前先看这一节）

- **`hub.size` 是 getter**，写成 `hub.size()` 会 500。
- **`createUiChannel` 的 broadcast 需要 `hub.broadcast` 包一层**，直接传 hub 会丢上下文。
- **`voice_send_to_conversation` 是「发完即忘」**，要结果必须用 `voice_tell`（带 relay）。
- **聊天会话与语音会话的 cwd 不同**：语音会话固定在中立目录，需要动文件就委托给前台对话或指定工作区。
- **`deepseek-flash` 起话题名时只吐 `reasoning-delta`**，正文可能为空 → 取 reasoning 最后一句兜底。
- **记录页/面板拖动**：`setPanelPos` 在 pointermove 里频繁 setState 会拖影，要直接改 `style.transform`。
- **`OrbDock` 的 hooks 必须都在 early-return 之前**，否则状态一变就崩（组件直接消失）。
- **悬浮球的点击是 pointerdown/up 判定**（拖动与点击共用一条链路），用 `click` 事件模拟点不动它。
- **冒烟测试里点悬浮球要派发 PointerEvent**，且必须先 `revealOrb()` 再点（收起态不渲染球）。
- **沙箱**：`ops_edit_file`/`ops_write_file` 在本 profile 里是 `PUBLICATION_DENIED`；`DSH_HOME` 下写删除会被工作区策略拒绝，需要提权审批。改插件文件一律「python 脚本 + 原子替换」。

## 8. 自检矩阵

```bash
cd voice-companion
node --check index.js && node --check client.js
node test/client-check.mjs    # 静态约束（无 JSX/无 @deepseek-ai 依赖/主题 token/槽位…）
node test/client-load.mjs     # 真执行客户端模块 + apply() + cleanup（防 import 崩溃）
node test/host-harness.mjs    # 假 ctx 起宿主：路由/SSE/llm tee/委托/回问/标题
node test/relay-check.mjs     # 委托状态机与摘要
node test/tools-check.mjs     # 工具注册 + confirm 门禁
node test/sse-dedupe.mjs <port>   # 需宿主在跑：两条 SSE 只留一条
```

页面级：`POST /voice-companion/smoke` → `GET /voice-companion/smoke-results`（或面板设置里「运行自检」）。**待机态也能跑**（常驻控制通道）。

## 9. 回滚

```bash
cd voice-companion && git log --oneline        # v48..v54 每版一个提交
git tag                                        # stable-v47 是行为基线
git checkout <commit> -- . && cd ..            # 插件管理器里 disable → enable
```
`plugin_manager set_bundle` 每次都要审批，disable/enable 各一次；只改 client.js 时用户 Ctrl+F5 即可，改宿主才需要重载 bundle。
