# 崩溃重启记录（DSH Desktop）

> 用途：每次因为本插件导致 DSH 崩溃重启，都在这里记一条原因与对策，避免重复踩坑。
> 症状统一为：`logs/crash-<ISO>-web-boot.log` 里 `Error: web boot: 1 entry did not activate / dsh-voice-companion: import failed`。

| 时间（UTC） | 触发动作 | 直接原因 | 对策 |
| --- | --- | --- | --- |
| 2026-11-10T12:23:17Z | 热改 `client.js` | 落盘内容语法错（`client.js:1755 Uncaught SyntaxError: Unexpected token ')'`）→ 页面导入失败 → web boot 失败 | 改完立刻 `node --check` |
| 2026-11-10T16:58:37Z | 改 `client.js` 同时插件在重载 | 读到半写/非法内容 | 原子写（临时文件 + `os.replace`） |
| 2026-11-11T14:09:47Z | 清理死代码后热改 | 清理后残留引用在激活阶段抛错 | 清理后必跑 `client-load`（真执行 factory+apply） |
| 2026-11-12T13:40:38Z | `patch-v55.py` 只命中 4/5 | 写出的 `client.js` 引用了尚不存在的 `matchWake`/`looksLikeEcho` | 补丁必须「全部命中才落盘」，且落盘前校验 |
| 2026-11-12T14:00:02Z | 点开设置面板 + 版本号不一致触发自动刷新 | ① `SettingsPanel` 误用未定义的 `st` → `ReferenceError: st is not defined`；② `checkBuild()` 的自动 `location.reload()` 与 web boot 抢时序，连刷两次 | 修变量作用域；**删除自动刷新**；宿主/客户端 build 必须在同一批次一起改 |

## 根因总结

1. DSH 会监视插件目录，`client.js` 一变就让页面重新导入。
2. 只要新内容**不能正确加载**（语法错、引用缺失、工厂/激活期抛错），`web boot` 就失败，整个应用崩溃重启。
3. 因此风险不在「写文件的那一刻」，而在「写进去的内容是否可加载」。

## 强制流程（已固化为工具）

```bash
# 所有改动都走这个（先暂存 → 校验 → 原子替换）
python tools/patch-vN.py   # 内部调用 tools/safe_apply.py
```

- `safe_apply.apply_pairs()`：任一 `(old,new)` 未唯一命中 → 整份不改。
- 校验：`node --check <暂存>`；若是 `client.js` 再加 `node test/client-load.mjs <暂存>`（真实执行 factory + apply + cleanup）。
- 通过才 `os.replace` 到目标路径。
- 宿主与客户端的 `CLIENT_BUILD` 必须同步（`index.js` / `client.js`），否则页面会判定版本不一致反复刷新。

## 铁律（按顺序执行，缺一不可）

1. **改客户端前先停用 bundle**：`plugin_manager set_bundle enabled:false`。停用后 client.js 不在模块图里，随便改都不会被热重载。
2. 改完用 `tools/safe_apply.py` 校验：`node --check` + `node test/client-load.mjs <暂存>`（真跑 factory+apply+cleanup）。
3. 宿主与客户端的 `CLIENT_BUILD` **同一轮一起改**，再 `enabled:true` 一次性重载。
4. 重载后跑 `/build` + `/health` + `POST /smoke`（12 项真实页面断言）。
