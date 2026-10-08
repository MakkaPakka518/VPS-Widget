// api/index.js — Vercel 版主入口：面板 "/" + 管理 API "/api/*"（登录鉴权，KV 持久化）
const crypto = require("crypto");
const store = require("../lib/store.js");
const kv = require("../lib/kv.js");
const reg = require("../lib/registry.js");
const updater = require("../lib/updater.js");
const { bjStamp, todayString } = require("../lib/util.js");
const widget = require("../lib/widget.js");
const panel = require("../lib/panel.js");

function sendJson(res, status, obj, cors) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (cors) res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(obj, null, 2));
}
function sendText(res, status, text, type) {
  res.statusCode = status;
  res.setHeader("Content-Type", type || "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(text);
}
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { resolve({}); } });
  });
}
function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}
function token() { return crypto.randomBytes(24).toString("hex"); }

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  let p = url.searchParams.get("__path") || url.pathname;
  if (p === "/api/index") p = "/";

  // 面板
  if (p === "/" && req.method === "GET") {
    sendText(res, 200, panel, "text/html; charset=utf-8");
    return;
  }

  // ---- 认证（免登录） ----
  if (p === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    const cfg = await store.loadConfig();
    if (store.sha256(String(body.password || "")) !== cfg.password) return sendJson(res, 401, { ok: false, error: "密码错误" });
    const t = token();
    await store.login(t);
    return sendJson(res, 200, { ok: true, token: t });
  }
  if (p === "/api/logout" && req.method === "POST") {
    const body = await readBody(req);
    if (body.token) await store.logout(body.token);
    return sendJson(res, 200, { ok: true });
  }
  if (p === "/api/auth/status" && req.method === "GET") {
    return sendJson(res, 200, { loggedIn: await store.isAuthed(bearer(req)) });
  }

  // 其余 /api/* 一律需要登录
  if (p.startsWith("/api/")) {
    if (!(await store.isAuthed(bearer(req)))) return sendJson(res, 401, { ok: false, error: "未登录" }, true);
  }

  const cfg = await store.loadConfig();

  if (p === "/api/sources" && req.method === "GET") {
    const arr = [];
    for (const name of Object.keys(reg.sources)) {
      const d = await kv.getJSON("data:" + name);
      arr.push({
        name,
        title: reg.sources[name].title,
        last_updated: (d && d.last_updated) || "",
        count: d ? reg.countOf(name, d) : 0,
        ok: !!d,
        error: "",
      });
    }
    return sendJson(res, 200, { configured: !!cfg.tmdbApiKey, sources: arr, lastRunDate: (await kv.get("lastRunDate")) || "" });
  }

  if (p === "/api/config" && req.method === "GET") {
    return sendJson(res, 200, { ...cfg, traktToken: store.maskToken(cfg.traktToken), password: undefined });
  }
  if (p === "/api/config" && req.method === "POST") {
    const body = await readBody(req);
    if (typeof body.tmdbApiKey === "string") cfg.tmdbApiKey = body.tmdbApiKey.trim();
    if (typeof body.traktToken === "string" && /^[0-9a-f]{40,}$/i.test(body.traktToken.trim())) cfg.traktToken = body.traktToken.trim();
    if (typeof body.vpsAddress === "string") cfg.vpsAddress = body.vpsAddress.trim();
    if (body.updateHour !== undefined) cfg.updateHour = Math.min(23, Math.max(0, Number(body.updateHour) || 17));
    if (body.updateEnabled !== undefined) cfg.updateEnabled = !!body.updateEnabled;
    await store.saveConfig(cfg);
    return sendJson(res, 200, { ok: true, configured: !!cfg.tmdbApiKey });
  }

  if (p === "/api/password" && req.method === "POST") {
    const body = await readBody(req);
    if (store.sha256(String(body.oldPassword || "")) !== cfg.password) return sendJson(res, 401, { ok: false, error: "原密码错误" });
    const newPw = String(body.newPassword || "");
    if (newPw.length < 4) return sendJson(res, 400, { ok: false, error: "新密码至少 4 位" });
    cfg.password = store.sha256(newPw);
    await store.saveConfig(cfg);
    return sendJson(res, 200, { ok: true });
  }

  if (p === "/api/update" && req.method === "POST") {
    const body = await readBody(req);
    if (!cfg.tmdbApiKey) return sendJson(res, 400, { ok: false, error: "尚未配置 TMDB API Key" });
    if (body.source) {
      const r = await updater.updateOne(body.source, cfg);
      await kv.set("lastRunDate", todayString());
      return sendJson(res, 200, r);
    }
    const results = {};
    for (const name of Object.keys(reg.sources)) {
      try { results[name] = await updater.updateOne(name, cfg); }
      catch (e) { results[name] = { ok: false, source: name, error: e.message || String(e) }; }
    }
    await kv.set("lastRunDate", todayString());
    return sendJson(res, 200, results);
  }

  if (p === "/api/preview" && req.method === "GET") {
    const name = url.searchParams.get("source") || "bangumi";
    if (!reg.sources[name]) return sendJson(res, 404, { error: "未知数据源" });
    const data = await kv.getJSON("data:" + name);
    return sendJson(res, 200, { source: name, last_updated: (data && data.last_updated) || "", count: data ? reg.countOf(name, data) : 0, data });
  }

  if (p === "/api/widget" && req.method === "GET") {
    const base = (cfg.vpsAddress || reg.siteUrl(req)).replace(/\/+$/, "");
    return sendJson(res, 200, {
      url: base + "/widget.js",
      dataUrls: Object.keys(reg.sources).map((n) => `${base}/data/${n}.json`),
      code: widget.generate(base),
    });
  }

  sendJson(res, 404, { error: "Not Found" });
};
