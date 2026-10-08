// lib/kv.js — Upstash KV (Vercel KV) 纯 REST 封装，零依赖
// 使用 Vercel 自动注入的环境变量：KV_REST_API_URL / KV_REST_API_TOKEN
// （在 Vercel 里关联一个 KV 实例后会自动出现，无需手动配）

const BASE = process.env.KV_REST_API_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || "";

async function call(path) {
  if (!BASE || !TOKEN) return null;
  let res;
  try {
    res = await fetch(BASE + path, { headers: { Authorization: "Bearer " + TOKEN } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try { const j = await res.json(); return j && j.result !== undefined ? j.result : null; }
  catch { return null; }
}

async function get(key) {
  return call("/get/" + encodeURIComponent(key));
}
async function set(key, value, ttlSeconds) {
  return call("/set/" + encodeURIComponent(key) + "/" + encodeURIComponent(String(value)) + (ttlSeconds ? "?EX=" + ttlSeconds : ""));
}
async function del(key) {
  return call("/del/" + encodeURIComponent(key));
}

async function getJSON(key) {
  const raw = await get(key);
  if (raw === null || raw === undefined) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function setJSON(key, obj, ttlSeconds) {
  return set(key, JSON.stringify(obj), ttlSeconds);
}

module.exports = { get, set, del, getJSON, setJSON, configured: () => !!(BASE && TOKEN) };
