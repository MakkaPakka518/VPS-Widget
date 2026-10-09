/**
 * 全站榜单 VPS 服务（骨朵/豆瓣/芒果/剧场/番剧/TMDB/B站/MAL/AniList/Trakt 十源）
 * =============================================
 * 常驻 Node 服务（默认端口 5555）：
 *   - 每天定时抓取 10 个榜单源 + TMDB 匹配
 *   - 网页管理面板：填 TMDB API Key、Trakt Token、预览各源数据、手动更新
 *   - 自动生成聚合 fw/rex 模块 widget.js（含 10 个子模块）
 *
 * 零依赖，只需 Node.js 18+。启动： node server.js
 * 面板： http://<VPS>:5555/   数据： /data/{guduo,douban,mgtv,theater,bangumi,tmdb,bili,mal,anilist,trakt}.json
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 5555;
const DATA_DIR = path.join(__dirname, "data");
const CONFIG_FILE = path.join(__dirname, "config.json");
const INDEX_FILE = path.join(__dirname, "public", "index.html");
const PASS_FILE = path.join(__dirname, ".adminpass"); // 安装时写入的明文密码（首次启动读取）

const { loadJson, saveJson, bjNow, todayString, bjStamp } = require("./lib/util");
const sources = {
  guduo: require("./lib/guduo"),
  douban: require("./lib/douban"),
  mgtv: require("./lib/mgtv"),
  theater: require("./lib/theater"),
  bangumi: require("./lib/bangumi"),
  tmdb: require("./lib/tmdb_rank"),
  bili: require("./lib/bili"),
  mal: require("./lib/mal"),
  anilist: require("./lib/anilist"),
  trakt: require("./lib/trakt"),
};
const widget = require("./lib/widget");

// ===== 配置 =====
const DEFAULTS = {
  tmdbApiKey: "",
  vpsAddress: "http://127.0.0.1:5555",
  updateHour: 17,
  updateEnabled: true,
};
let config = Object.assign({}, DEFAULTS, loadJson(CONFIG_FILE) || {});

// ===== 登录密码 =====
function sha256(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }
/** 掩码敏感 token：保留首尾 4 位，中间省略；过短则置空 */
function maskToken(t) {
  const s = String(t || "");
  return s.length >= 8 ? s.slice(0, 4) + "…" + s.slice(-4) : "";
}
function ensurePassword() {
  if (config.password) return; // config 里已是哈希
  let pw = "admin";
  try { pw = fs.readFileSync(PASS_FILE, "utf8").trim() || "admin"; } catch {}
  config.password = sha256(pw);
  saveJson(CONFIG_FILE, config);
}
ensurePassword();

// 会话：token -> 过期时间戳(ms)
const sessions = new Map();
const SESSION_TTL = 24 * 3600 * 1000;
function isAuthed(req) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const exp = sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}

// ===== 状态 =====
// state[src] = { last_updated, count, ok, error, running }
const state = {};
for (const name of Object.keys(sources)) state[name] = { last_updated: "", count: 0, ok: false, error: "", running: false };
let updating = {}; // 每源独立锁
let fetching = false; // 全局：是否有抓取任务在进行
let lastRunDate = "";

function dataFile(name) { return path.join(DATA_DIR, `${name}.json`); }

function readSourceData(name) {
  return loadJson(dataFile(name)) || (name === "bangumi"
    ? { last_updated: "", total_matched: 0, hot_anime: [] }
    : { last_updated: "" });
}

// ===== 抓取 =====
async function updateSource(name) {
  if (updating[name]) return { ok: false, error: "该源已有更新任务在进行" };
  if (!config.tmdbApiKey) return { ok: false, error: "尚未配置 TMDB API Key" };
  updating[name] = true;
  state[name].running = true;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const data = await sources[name].fetch(config.tmdbApiKey, config.traktToken || "");
    saveJson(dataFile(name), data);
    const count = countOf(name, data);
    state[name] = { last_updated: data.last_updated || bjStamp(), count, ok: true, error: "", running: false };
    console.log(`[update:${name}] ok, ${count} 条`);
    return { ok: true, count, source: name };
  } catch (e) {
    state[name].error = e.message || String(e);
    state[name].ok = false;
    state[name].running = false;
    console.error(`[update:${name}] error:`, e.message || e);
    return { ok: false, source: name, error: state[name].error };
  } finally {
    updating[name] = false;
    state[name].running = false;
  }
}

function countOf(name, data) {
  if (name === "guduo") {
    return Object.values(data.categories || {}).reduce((s, arr) => s + arr.length, 0);
  }
  if (name === "bangumi") return (data.hot_anime || []).length;
  if (name === "theater") {
    return Object.entries(data).filter(([k]) => k !== "last_updated").reduce((s, [, v]) => s + (v.aired || []).length, 0);
  }
  // douban / mgtv：统计非 last_updated 字段的数组
  return Object.entries(data).filter(([k]) => k !== "last_updated").reduce((s, [, v]) => s + (Array.isArray(v) ? v.length : 0), 0);
}

async function updateAll() {
  if (fetching) return {};
  fetching = true;
  try {
    const results = {};
    for (const name of Object.keys(sources)) {
      results[name] = await updateSource(name);
    }
    lastRunDate = todayString();
    return results;
  } finally {
    fetching = false;
  }
}

// ===== 定时 =====
function scheduleTick() {
  if (!config.updateEnabled) return;
  const now = bjNow();
  if (now.getHours() === config.updateHour && todayString() !== lastRunDate) {
    updateAll().then((r) => console.log("[schedule]", r));
  }
}

// ===== HTTP =====
function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj, null, 2));
}
function sendText(res, status, text, type) {
  res.writeHead(status, { "Content-Type": type || "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(text);
}
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname;

  // 面板
  if (p === "/" && req.method === "GET") {
    try { sendText(res, 200, fs.readFileSync(INDEX_FILE, "utf8"), "text/html; charset=utf-8"); }
    catch { sendText(res, 500, "index.html 不存在"); }
    return;
  }

  // 数据接口
  const dm = p.match(/^\/data\/(\w+)\.json$/);
  if (dm && req.method === "GET") {
    const name = dm[1];
    if (!sources[name]) return sendJson(res, 404, { error: "未知数据源" });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    });
    res.end(JSON.stringify(readSourceData(name), null, 2));
    return;
  }

  // 生成的聚合模块
  if (p === "/widget.js" && req.method === "GET") {
    sendText(res, 200, widget.generate(config.vpsAddress), "application/javascript; charset=utf-8");
    return;
  }

  // ---- 认证（免登录） ----
  if (p === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    if (sha256(String(body.password || "")) !== config.password) {
      return sendJson(res, 401, { ok: false, error: "密码错误" });
    }
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, Date.now() + SESSION_TTL);
    return sendJson(res, 200, { ok: true, token });
  }
  if (p === "/api/logout" && req.method === "POST") {
    const body = await readBody(req);
    if (body.token) sessions.delete(body.token);
    return sendJson(res, 200, { ok: true });
  }
  if (p === "/api/auth/status" && req.method === "GET") {
    return sendJson(res, 200, { loggedIn: isAuthed(req) });
  }

  // 其余 /api/* 一律需要登录
  if (p.startsWith("/api/")) {
    if (!isAuthed(req)) {
      res.writeHead(401, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
      return res.end(JSON.stringify({ ok: false, error: "未登录" }));
    }
  }

  // ---- API ----
  if (p === "/api/sources" && req.method === "GET") {
    sendJson(res, 200, {
      configured: !!config.tmdbApiKey,
      sources: Object.keys(sources).map((name) => ({ name, title: sources[name].title, ...state[name], running: !!updating[name] })),
      lastRunDate,
      fetching,
    });
    return;
  }

  if (p === "/api/config" && req.method === "GET") {
    // 掩码返回 trakt token，避免面板误漏（完整值仅存在 VPS 本地 config.json）
    sendJson(res, 200, { ...config, traktToken: maskToken(config.traktToken) });
    return;
  }
  if (p === "/api/config" && req.method === "POST") {
    const body = await readBody(req);
    if (typeof body.tmdbApiKey === "string") config.tmdbApiKey = body.tmdbApiKey.trim();
    if (typeof body.traktToken === "string" && /^[0-9a-f]{40,}$/i.test(body.traktToken.trim())) config.traktToken = body.traktToken.trim();
    if (typeof body.vpsAddress === "string") config.vpsAddress = body.vpsAddress.trim() || DEFAULTS.vpsAddress;
    if (body.updateHour !== undefined) config.updateHour = Math.min(23, Math.max(0, Number(body.updateHour) || 17));
    if (body.updateEnabled !== undefined) config.updateEnabled = !!body.updateEnabled;
    saveJson(CONFIG_FILE, config);
    sendJson(res, 200, { ok: true, configured: !!config.tmdbApiKey });
    return;
  }

  if (p === "/api/password" && req.method === "POST") {
    const body = await readBody(req);
    const newPw = String(body.newPassword || "");
    if (sha256(String(body.oldPassword || "")) !== config.password) {
      return sendJson(res, 401, { ok: false, error: "原密码错误" });
    }
    if (newPw.length < 4) return sendJson(res, 400, { ok: false, error: "新密码至少 4 位" });
    config.password = sha256(newPw);
    saveJson(CONFIG_FILE, config);
    return sendJson(res, 200, { ok: true });
  }

  if (p === "/api/update" && req.method === "POST") {
    const body = await readBody(req);
    if (!config.tmdbApiKey) return sendJson(res, 400, { ok: false, error: "尚未配置 TMDB API Key" });
    if (body.source) {
      if (updating[body.source]) return sendJson(res, 409, { ok: false, error: "该源已有抓取任务在进行" });
      // 后台抓取，立即返回；前端轮询 /api/sources 查看进度
      updateSource(body.source).then(() => {}).catch(() => {});
      return sendJson(res, 200, { ok: true, started: true, source: body.source });
    }
    if (fetching) return sendJson(res, 409, { ok: false, error: "已有抓取任务在进行" });
    updateAll().then(() => {}).catch(() => {});
    return sendJson(res, 200, { ok: true, started: true });
  }

  if (p === "/api/preview" && req.method === "GET") {
    const name = url.searchParams.get("source") || "bangumi";
    if (!sources[name]) return sendJson(res, 404, { error: "未知数据源" });
    sendJson(res, 200, { source: name, ...state[name], data: readSourceData(name) });
    return;
  }

  if (p === "/api/widget" && req.method === "GET") {
    sendJson(res, 200, {
      url: (config.vpsAddress || "").replace(/\/+$/, "") + "/widget.js",
      dataUrls: Object.keys(sources).map((n) => `${(config.vpsAddress || "").replace(/\/+$/, "")}/data/${n}.json`),
      code: widget.generate(config.vpsAddress),
    });
    return;
  }

  sendJson(res, 404, { error: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`全站榜单 VPS 服务已启动： http://0.0.0.0:${PORT}`);
  console.log(`  面板： http://<VPS>:${PORT}/`);
  console.log(`  数据： /data/{guduo,douban,mgtv,theater,bangumi,tmdb,bili,mal,anilist,trakt}.json`);
  console.log(`  模块： http://<VPS>:${PORT}/widget.js`);
  if (config.tmdbApiKey) {
    setTimeout(() => updateAll().then((r) => console.log("[startup]", r)), 1500);
  }
  setInterval(scheduleTick, 60 * 1000);
});
