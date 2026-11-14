# voice-companion 变更记录（仓库内）

> 回滚：`git checkout <commit> -- .` 然后到面板把 dsh-voice-companion 关掉再打开。
> 基线：`stable-v47` = be4b2e1（悬浮球 + 通话 + 记录 + 话题名，稳定版）。

## v54 / 0.1.26（2026-11-12）

- 常驻控制通道：页面启动即建立一条 SSE（不再只在通话时建立），挂断后保持连接。好处是「面板跳转 / 打开某对话 / 自检 / 状态同步」在待机时也能收到事件；同时从结构上消除「两条 SSE 并存」的可能（这就是回复重复的根因）。
- `startCall` 复用已有连接、`stopCall` 不再关闭连接、`dispose` 才关闭。
- 修复冒烟自检在待机态崩溃：`statusOf(cur)` 在 `cur === null` 时抛错 → 改为 `statusOf(store.get())`。
- 宿主 `CLIENT_BUILD` 与客户端同步为 `v54`（两边必须一起改）。
- 自检：client-load 4/4、client-check 13/13、host-harness 23/23、真实页面冒烟 11/11（**待机态**也能跑）、SSE 去重 3/3。

## v53 / 0.1.25（2026-11-12）

- 修复「每条语音回复重复一遍」：根因是同一页面同时存在两条 SSE 连接（`/events`），同一条 `sentence` 事件被两个连接各处理一次，于是字幕、记录、朗读都成双。
  - 宿主 `hub.attach(res, tabId)` 按 tabId 去重：新连接建立时顶掉旧连接（先发 `closed` 事件再 `end()`）。
  - 客户端 `openEvents()` 开新连接前先关旧连接；`sentence` 事件按 `id` 去重（保留最近 400 条 id）。
  - 记录写入侧加去重：同角色、同文本、4 秒内不重复落盘；`sanitizeRecords()` 启动时顺带清理历史遗留的重复行（本次把 17 条清成 10 条）。
- 新增 `test/sse-dedupe.mjs`：用两条真实 SSE 连接验证「旧连接被顶掉、广播只投递一次」，3/3 通过。

## v52 / 0.1.24（2026-11-11）

- 新增「真实页面冒烟自检」：宿主 `POST /voice-companion/smoke` 广播 `smoke` 事件，客户端在真实页面里跑 11 项检查（运行时、悬浮球挂载、可展开、扇出三入口开合、通话卡片、记录面板及内容区、状态模型、主题背景），结果经 `POST /smoke-result` 回传，`GET /smoke-results` 可读最近 20 条。实测 11/11 通过。
- 新增设置面板底部「运行自检」入口（`Ctrl+Shift+Space` 或面板头像），一键触发并显示 `smokeReport`。
- 修复 `/smoke` 路由 `hub.size is not a function`（`size` 是 getter）。
- 清理死代码约 385 行：`RecordsPage`/`RecordsTab`/`mountSidebarRecordsTab` 及其 53 条 CSS（侧栏「语音记录」页签早已移除）。
- 说明：冒烟测试通过 pointerdown/pointerup 触发（悬浮球的可点区域走的是指针事件而非 click）。

## v51 / 0.1.23（2026-11-11）委托可见化 + 破坏性操作硬门禁 + 话题改名

- 面板新增「委托」区：显示 #id、状态（处理中/已完成/失败）、摘要，处理中的可直接取消（`POST /delegations/cancel`）。
- `voice_app_quit` / `voice_conversation_archive` / `voice_records_delete` / `voice_records_clear` 增加 `confirm` 参数：不传就返回 `need-confirm` 并拒绝执行，必须先 `voice_ask` 征得同意。
- 话题记录支持「改名 / 重新起名」（`✎` / `↻` 按钮，`POST /records/<id>/title` 支持自定义标题与 regenerate）。
- 测试：host-harness 23/23、tools-check 8/8、client-check 13/13、client-load 4/4、relay-check 18/18。

## v50 / 0.1.22（2026-11-11）语音委托 + 反向回问 + 情境共享

- `voice_tell`：把任务委托给指定对话（默认前台对话），消息带 `【语音委托 #id】` 前缀；对方回合结束后宿主自动把结论压成 2–3 句念出来（通话之外只广播不发声）。
- `voice_delegations`：查看/取消委托。
- `voice_ask` + `POST /ask/answer`：主对话需要拍板时用语音提问并等口头回答（默认 60 秒超时，不挂死）；语音侧识别到待回答问题时会先把它当作回答回填。
- `voice_context` / `voice_status`：前台对话摘要（标题/目录/是否运行/最近 3 条/待办委托数）注入语音会话系统提示（≤400 字）。
- 防环：内容含 `【语音委托 #` 或 `【语音回问 #` 一律判回声，不再转交。
- 测试：host-harness 21/21、client-check 13/13、client-load 4/4、relay-check 18/18。

## v49 / 0.1.21（2026-11-11）麦克风自愈

- `createMic` 拆成 attach/detach/acquire/restart/health，控制器每 4 秒体检（`tickMic`），异常自动 `recoverMic`；面板加「重连麦克风」。
- 新增 `test/client-load.mjs`：真正执行客户端模块，防「import failed → App 重启」。

## v48 / 0.1.20（2026-11-11）语音委托

- `lib/host/relay.js`：委托生命周期（pending/running/done/failed/cancelled）+ `speechDigest` 摘要。
- `llm/stream` 双通道：语音会话朗读 + 被委托会话静默采集，回合结束自动播报结论。
- `test/relay-check.mjs` 18 项。


## v56 (0.1.27) — 打断更灵敏 / 唤醒更克制 / 委托历史与重试

- **打断**：助手朗读时判定阈值从 1.9x 降到 1.45x，开口判定帧数从 3 降到 2，并在越线第一帧先 duck，立即停播——不再等整句念完。
- **唤醒**：`matchWake()` 归一化匹配（去标点/空格/大小写，支持 `,，/|、` 多别名，只认开头），新增回声过滤（`pushSpoken`/`looksLikeEcho`，9 秒窗口）与 2.5 秒重复冷却——不再被自己的朗读或半句话误触发。
- **委托历史**：`relay` 持久化到 `DSH_HOME/voice-companion/delegations.json`（上限 60 条），`GET /delegations` 附带 `history`，新增 `POST /delegations/retry {id}` 与 `POST /delegations/clear`；`voice_delegations` 支持 `history` / `retry`；面板显示最近 4 条历史委托并带 ↻ 重试。
- **构建安全**（血泪教训）：所有文件改动改走 `tools/safe_apply.py`——先写暂存副本 → `node --check`（client.js 另跑 `client-load`）→ 全部通过才 `os.replace` 落盘。DSH 会热重载 `client.js`，落盘内容不合法会导致 `web boot` 失败并整个应用崩溃重启。

## v58 (0.1.28) — 修设置面板白屏/消失 + 彻底去掉自动刷新

- **修复**：`SettingsPanel` 里误用了外层 `st`（未定义变量）→ 点设置时 `ReferenceError: st is not defined`，该插槽整棵子树卸载，悬浮球与卡片一起消失。改为 `props.smokeReport`，并在调用处传入 `smokeReport`。
- **去掉自动刷新**：`checkBuild()` 不再 `location.reload()`。页面重载会和 DSH 的 web boot 抢时序，曾导致 `web boot: 1 entry did not activate` 并让整个应用崩溃重启；现在只提示「按 Ctrl+Shift+R 刷新」。
- **冒烟加一项**：`设置面板可打开`，真实页面 12/12 通过。

## v59 (0.1.29) — 打断更快、唤醒容错、噪声自适应、委托完成提示

- **打断**：明显高于环境噪声时（`rms > max(0.02, ambient*2.2)`）第一帧即判定开口，`speechRun` 门槛从 2 降到 1；不再需要等一句播完。
- **噪声自适应**：新增 `ambient`（环境响度慢跟随），起点阈值 `startThr = max(0.007, noiseFloor*mult, ambient*1.35)`，尾音阈值 `stopThr = max(0.004, noiseFloor*mult*0.55)`，形成迟滞，嘈杂房间少误触发、句子中间不易被切段。
- **唤醒容错**：`wakeHeadLen()` 先精确匹配，长度 ≥3 的别名允许 1 个字偏差（同音/漏字），命中后返回 `fuzzy` 标记。
- **委托完成提示**：SSE `delegate` 事件现在会往面板字幕追加「✔ 已完成 #id：摘要」。

## v60 (0.1.30) — 面板显示当前话题与上下文用量、记录一键导出全部

- 面板标题栏新增：当前话题标题（来自记录标题）+ 轮次/阈值与百分比（`st.turns` / `settings.autoCompactTurns`），到达阈值前可直观看到上下文压力。
- 记录面板新增「导出全部」：`GET /records/export` → `exportAll()` 汇总所有话题为一个 Markdown 文件下载。

## v61 (0.1.31) — 多窗口忙线保护、委托排队与自动重试、跨话题搜索

- 忙线保护：`POST /start` 发现另一个标签页正在通话时返回 `code:'busy'`，不抢麦；面板出现「接管」按钮可切到当前窗口（`force:true`）。
- 委托状态：`relay` 记录 `queued/retries/retryOf`；目标对话正在跑时显示「排队中」，失败自动重试一次并提示。
- 跨话题搜索：新增 `GET /records/search?q=`（逐话题扫描 user/assistant 文本），记录面板搜索框输入 ≥2 字时同时显示「跨话题搜索」结果，点击跳到对应话题。

## v62 (0.1.32) — 多窗口标识、历史只留对话、跨话题长期记忆

- 非通话持有窗口：状态显示「已在别处通话」，并自动在本地停掉麦克风/播放（不打扰正在通话的那个窗口）。
- 记录历史只保留「你」和「助手」两类条目，`note` 提示行不再出现在详情与导出里（启动时的 sanitize 会顺手清掉旧数据）。
- 长期记忆：换话题时把一段对话的一句话摘要写入 `voice-companion/memory.jsonl`（最多 40 条），新话题系统提示带上最近 3 条要点。
