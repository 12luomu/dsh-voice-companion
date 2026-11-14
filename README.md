# dsh-voice-companion（语音伙伴）

DSH 的实时语音助手插件：常驻悬浮球 + 通话卡片 + 独立语音会话 + 语音记录。

## 安装

需要 DSH 0.2.x、Node.js 20.3 或更新版本。

- **DSH Desktop**：设置 → 插件 → 搜索 `dsh-voice-companion` 一键安装（或从插件市场装）。
- **命令行**：`dsh plugin --profile <profile> add dsh-voice-companion`。
- **从 GitHub**：`dsh plugin --profile <profile> add github:12luomu/dsh-voice-companion`。

装好后刷新页面，右下角会出现悬浮球；首次点开需要授权麦克风。识别复用 DSH 已下载的本地 SenseVoice 模型（零 API Key），朗读走 Edge TTS，默认音色晓晓。

## 功能

- **悬浮球**：常驻右下，可拖动、四边吸附半隐藏；点击展开/收起扇出（麦克风开关、打开卡片、历史记录）。
- **实时语音对话**：浏览器 VAD 自动断句 → 本地 SenseVoice 识别（零 API Key）→ 直接发进独立语音会话 → 回复逐句用 Edge TTS 朗读（默认晓晓）。
- **独立上下文**：语音会话与主对话分离，可安静默 10 分钟自动新话题、20 轮滚动摘要、记录 30 天/500 句上限。
- **语音记录**：面板里的「历史」按话题分组，只保留你说的话与助手复读的内容；可导出/删除（删除进回收站）。
- **话题名**：首轮对话结束自动生成一次，可在记录页改名/重新生成。
- **委托**：语音可委托前台对话干活（`voice_tell`），完成时播报结论；可取消。
- **回问**：主对话可用 `voice_ask` 让用户口头拍板（默认 60 秒超时）。
- **情境**：`voice_context` / `voice_status` 让语音知道前台在做什么，也可以导航侧栏、开关面板、退出 DSH（危险操作需口头确认）。

## 自检

```bash
node --check index.js && node --check client.js
node test/client-check.mjs    # 静态约束 13 项
node test/client-load.mjs     # 模块可加载/可激活 4 项
node test/host-harness.mjs    # 宿主路由与 llm tee 23 项
node test/relay-check.mjs     # 委托摘要与状态机 18 项
node test/tools-check.mjs     # 工具注册与 confirm 门禁 8 项
```

真实页面冒烟：插件启用后 `POST /voice-companion/smoke`，再 `GET /voice-companion/smoke-results`（或点面板设置里的「运行自检」）。

## 回滚

仓库内 `git tag` 有基线 `stable-v47`；`CHANGELOG.md` 记录每版改动与回滚方法。

## 文档

- 实现笔记（架构/不变量/坑清单/自检矩阵/回滚）：[`docs/IMPL-NOTES.md`](./docs/IMPL-NOTES.md)
- 版本变更：[`CHANGELOG.md`](./CHANGELOG.md)
