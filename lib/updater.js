// lib/updater.js — 单源抓取 + KV 持久化 + 数量截断（适配免费档 10s 超时）
const kv = require("./kv");
const { sources, countOf } = require("./registry");
const { bjStamp } = require("./util");

const LIMIT = 50; // 每源最多存前 50 条（用户接受 30~50）

/** 把对象内所有数组截断到 LIMIT（guduo 嵌套 categories 也能处理） */
function truncate(obj) {
  if (Array.isArray(obj)) return obj.slice(0, LIMIT);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = truncate(obj[k]);
    return out;
  }
  return obj;
}

/** 抓取单个源并写入 KV data:<name>，返回 {ok,source,count,last_updated} */
async function updateOne(name, cfg) {
  const key = "data:" + name;
  const data = await sources[name].fetch(cfg.tmdbApiKey, cfg.traktToken || "");
  const stored = truncate(data);
  await kv.setJSON(key, stored);
  return { ok: true, source: name, count: countOf(name, stored), last_updated: stored.last_updated || bjStamp() };
}

/** 轮转选下一个源：从 KV 读游标，返回 {name, cursor} */
async function nextSource() {
  const names = Object.keys(sources);
  const cursor = Number((await kv.get("cron:cursor")) || 0) % names.length;
  const name = names[cursor];
  await kv.set("cron:cursor", String((cursor + 1) % names.length));
  return name;
}

module.exports = { updateOne, nextSource, truncate, LIMIT };
