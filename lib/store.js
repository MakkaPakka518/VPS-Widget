// lib/store.js — 配置与会话的 KV 持久化（Vercel serverless 无磁盘，全部走 KV）
const kv = require("./kv");
const crypto = require("crypto");

const DEFAULTS = {
  tmdbApiKey: "",
  traktToken: "",
  vpsAddress: "", // Vercel 版为空时自动用当前请求域名
  updateHour: 17,
  updateEnabled: true,
};

function sha256(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function maskToken(t) {
  const s = String(t || "");
  return s.length >= 8 ? s.slice(0, 4) + "…" + s.slice(-4) : "";
}

async function loadConfig() {
  const stored = await kv.getJSON("config");
  const cfg = Object.assign({}, DEFAULTS, stored || {});
  // 首次运行：从环境变量 ADMIN_PASSWORD 播种密码（未设则默认 admin，README 建议面板内改）
  if (!cfg.password) {
    cfg.password = sha256(process.env.ADMIN_PASSWORD || "admin");
    await saveConfig(cfg);
  }
  return cfg;
}
async function saveConfig(cfg) { return kv.setJSON("config", cfg); }

// 会话：token -> KV 键，TTL 24h
async function isAuthed(token) { return token ? (await kv.get("sess:" + token)) !== null : false; }
async function login(token) { await kv.set("sess:" + token, "1", 86400); }
async function logout(token) { await kv.del("sess:" + token); }

module.exports = { loadConfig, saveConfig, sha256, maskToken, isAuthed, login, logout, DEFAULTS, kvConfigured: kv.configured };
