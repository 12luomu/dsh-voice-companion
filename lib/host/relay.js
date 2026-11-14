/**
 * 语音 ↔ 主对话 的委托中转层。
 *
 * 语音助手说「让主对话去做 X」时：
 *   1) create() 生成一条委托（带短 id），客户端把消息注入目标会话；
 *   2) 目标会话跑回合时，host 的 llm/stream 钩子把正文喂给 capture()；
 *   3) 回合结束 finish() 生成一句可朗读的摘要，回调通知上层播报。
 *
 * 这里只做状态与文本，不碰网络/播放，方便单测。
 */

import fs from 'node:fs';
import path from 'node:path';

const MAX_ITEMS = 30;
const HISTORY_MAX = 60;
const MAX_TEXT = 4000;
const DIGEST_CHARS = 180;

function shortId() {
  return Math.random().toString(36).slice(2, 6);
}

/** 去掉 Markdown / 代码块 / 链接，压成适合朗读的一句话 */
export function speechDigest(raw, limit = DIGEST_CHARS) {
  let text = String(raw || '');
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/`[^`]*`/g, ' ');
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/https?:\/\/\S+/g, ' ');
  text = text.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  text = text.replace(/[*_~]+/g, '');
  text = text.replace(/\|/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'), cut.lastIndexOf('. '));
  return (stop > limit * 0.5 ? cut.slice(0, stop + 1) : cut) + '…';
}

export function createRelay({ onComplete, max = MAX_ITEMS, historyFile = null, historyMax = HISTORY_MAX } = {}) {
  /** id -> item */
  const items = new Map();
  /** sessionId -> 累计正文 */
  const buffers = new Map();

  /* ---- 持久化历史：让用户事后能查「昨天让主对话干过什么」并一键重试 ---- */
  const historyItems = [];
  function loadHistory() {
    if (!historyFile) return;
    try {
      const raw = fs.readFileSync(historyFile, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        historyItems.length = 0;
        for (const it of arr.slice(0, historyMax)) {
          if (it && it.id) historyItems.push(it);
        }
      }
    } catch {
      /* 首次运行没有文件，正常 */
    }
  }
  function saveHistory() {
    if (!historyFile) return;
    try {
      fs.mkdirSync(path.dirname(historyFile), { recursive: true });
      const tmp = historyFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(historyItems.slice(0, historyMax)));
      fs.renameSync(tmp, historyFile);
    } catch {
      /* 写历史失败不影响委托本身 */
    }
  }
  function pushHistory(item) {
    const view = publicView(item);
    historyItems.unshift(view);
    if (historyItems.length > historyMax) historyItems.length = historyMax;
    saveHistory();
    return view;
  }
  loadHistory();

  function publicView(item) {
    return {
      id: item.id,
      sessionId: item.sessionId,
      text: item.text,
      status: item.status,
      digest: item.digest,
      createdAt: item.createdAt,
      finishedAt: item.finishedAt,
      queued: !!item.queued,
      retries: Number(item.retries || 0),
      retryOf: item.retryOf || ''
    };
  }

  function create({ sessionId, text, queued = false, retries = 0, retryOf = '' }) {
    const id = shortId();
    const item = {
      id,
      sessionId: String(sessionId || ''),
      text: String(text || '').slice(0, 2000),
      status: 'pending',
      digest: '',
      createdAt: Date.now(),
      finishedAt: 0,
      queued: !!queued,
      retries: Number(retries || 0),
      retryOf: String(retryOf || '')
    };
    items.set(id, item);
    if (items.size > max) {
      const oldest = [...items.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) items.delete(oldest.id);
    }
    return publicView(item);
  }

  function get(id) {
    const item = items.get(String(id || ''));
    return item ? publicView(item) : null;
  }

  function list() {
    return [...items.values()].sort((a, b) => b.createdAt - a.createdAt).map(publicView);
  }

  /** 该会话当前是否有等待结果的委托 */
  function isPending(sessionId) {
    const sid = String(sessionId || '');
    if (!sid) return false;
    for (const item of items.values()) {
      if (item.sessionId === sid && (item.status === 'pending' || item.status === 'running')) return true;
    }
    return false;
  }

  function begin(sessionId) {
    const sid = String(sessionId || '');
    for (const item of items.values()) {
      if (item.sessionId === sid && item.status === 'pending') item.status = 'running';
    }
  }

  function capture(sessionId, text) {
    const sid = String(sessionId || '');
    if (!sid || !text) return;
    const next = ((buffers.get(sid) || '') + String(text)).slice(-MAX_TEXT);
    buffers.set(sid, next);
  }

  function finish(sessionId, options = {}) {
    const sid = String(sessionId || '');
    const active = [...items.values()].filter(
      (item) => item.sessionId === sid && (item.status === 'pending' || item.status === 'running')
    );
    const raw = buffers.get(sid) || '';
    buffers.delete(sid);
    if (!active.length) return null;
    const ok = options.ok !== false;
    const digest = speechDigest(raw);
    for (const item of active) {
      item.status = ok ? 'done' : 'failed';
      item.digest = digest;
      item.finishedAt = Date.now();
      pushHistory(item);
    }
    const payload = { items: active.map(publicView), digest, ok };
    try {
      onComplete?.(payload);
    } catch {
      /* 播报失败不影响状态 */
    }
    return payload;
  }

  function cancel(id) {
    const item = items.get(String(id || ''));
    if (!item) return null;
    if (item.status === 'pending' || item.status === 'running') {
      item.status = 'cancelled';
      item.finishedAt = Date.now();
      pushHistory(item);
    }
    return publicView(item);
  }

  function clearFinished(olderThanMs = 24 * 3600 * 1000) {
    const now = Date.now();
    let removed = 0;
    for (const [id, item] of [...items.entries()]) {
      const settled = item.status === 'done' || item.status === 'failed' || item.status === 'cancelled';
      if (settled && now - item.finishedAt > olderThanMs) {
        items.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  function history(limit = 20) {
    return historyItems.slice(0, Math.max(1, Math.min(historyMax, Number(limit) || 20)));
  }

  function clearHistory() {
    const removed = historyItems.length;
    historyItems.length = 0;
    saveHistory();
    return removed;
  }

  function historyGet(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    for (const it of historyItems) {
      if (it.id === key) return it;
    }
    return null;
  }

  return {
    create, get, list, isPending, begin, capture, finish, cancel, clearFinished,
    history, historyGet, clearHistory, size: () => items.size
  };
}
