// api/cron.js — 定时更新入口（Vercel Cron 触发）：每次只更新一个源（轮转），适配免费档 10s 超时
const store = require("../lib/store.js");
const updater = require("../lib/updater.js");
const { todayString } = require("../lib/util.js");
const kv = require("../lib/kv.js");

module.exports = async function (req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const cfg = await store.loadConfig();
  if (!cfg.updateEnabled) {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false, error: "updateEnabled 关闭，跳过" }));
    return;
  }
  if (!cfg.tmdbApiKey) {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false, error: "尚未配置 TMDB API Key，跳过（面板登录后填写）" }));
    return;
  }
  const name = await updater.nextSource();
  try {
    const r = await updater.updateOne(name, cfg);
    await kv.set("lastRunDate", todayString());
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, source: name, count: r.count, last_updated: r.last_updated }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, source: name, error: e.message || String(e) }));
  }
};
