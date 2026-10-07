/**
 * 全站榜单 VPS 服务（骨朵/豆瓣/芒果/剧场/番剧 五源）
 * =============================================
 * 常驻 Node 服务（默认端口 5555）：
 *   - 每天定时抓取 5 个榜单源 + TMDB 匹配
 *   - 网页管理面板：填 TMDB API Key、预览各源数据、手动更新
 *   - 自动生成聚合 fw/rex 模块 widget.js（含 5 个子模块）
 *
 * 零依赖，只需 Node.js 18+。启动： node server.js
 * 面板： http://<VPS>:5555/   数据： /data/{guduo,douban,mgtv,theater,bangumi}.json
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 5555;
const DATA_DIR = path.join(__dirname, "data");
const CONFIG_FILE = path.join(__dirname, "config.json");
const INDEX_FILE = path.join(__dirname, "public", "index.html");

const { loadJson, saveJson, bjNow, todayString, bjStamp } = require("./lib/util");
const sources = {
  guduo: require("./lib/guduo"),
  douban: require("./lib/douban"),
  mgtv: require("./lib/mgtv"),
  theater: require("./lib/theater"),
  bangumi: require("./lib/bangumi"),
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

// ===== 状态 =====
// state[src] = { last_updated, count, ok, error }
const state = {};
for (const name of Object.keys(sources)) state[name] = { last_updated: "", count: 0, ok: false, error: "" };
let updating = {}; // 每源独立锁
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
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const data = await sources[name].fetch(config.tmdbApiKey);
    saveJson(dataFile(name), data);
    const count = countOf(name, data);
    state[name] = { last_updated: data.last_updated || bjStamp(), count, ok: true, error: "" };
    console.log(`[update:${name}] ok, ${count} 条`);
    return { ok: true, count, source: name };
  } catch (e) {
    state[name].error = e.message || String(e);
    state[name].ok = false;
    console.error(`[update:${name}] error:`, e.message || e);
    return { ok: false, source: name, error: state[name].error };
  } finally {
    updating[name] = false;
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
  const results = {};
  for (const name of Object.keys(sources)) {
    results[name] = await updateSource(name);
  }
  lastRunDate = todayString();
  return results;
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

  // ---- API ----
  if (p === "/api/sources" && req.method === "GET") {
    sendJson(res, 200, {
      configured: !!config.tmdbApiKey,
      sources: Object.keys(sources).map((name) => ({ name, title: sources[name].title, ...state[name] })),
      lastRunDate,
    });
    return;
  }

  if (p === "/api/config" && req.method === "GET") {
    sendJson(res, 200, { ...config });
    return;
  }
  if (p === "/api/config" && req.method === "POST") {
    const body = await readBody(req);
    if (typeof body.tmdbApiKey === "string") config.tmdbApiKey = body.tmdbApiKey.trim();
    if (typeof body.vpsAddress === "string") config.vpsAddress = body.vpsAddress.trim() || DEFAULTS.vpsAddress;
    if (body.updateHour !== undefined) config.updateHour = Math.min(23, Math.max(0, Number(body.updateHour) || 17));
    if (body.updateEnabled !== undefined) config.updateEnabled = !!body.updateEnabled;
    saveJson(CONFIG_FILE, config);
    sendJson(res, 200, { ok: true, configured: !!config.tmdbApiKey });
    return;
  }

  if (p === "/api/update" && req.method === "POST") {
    const body = await readBody(req);
    if (body.source) {
      const r = await updateSource(body.source);
      sendJson(res, r.ok ? 200 : 400, r);
    } else {
      const r = await updateAll();
      const anyOk = Object.values(r).some((x) => x.ok);
      sendJson(res, anyOk ? 200 : 400, r);
    }
    return;
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
  console.log(`  数据： /data/{guduo,douban,mgtv,theater,bangumi}.json`);
  console.log(`  模块： http://<VPS>:${PORT}/widget.js`);
  if (config.tmdbApiKey) {
    setTimeout(() => updateAll().then((r) => console.log("[startup]", r)), 1500);
  }
  setInterval(scheduleTick, 60 * 1000);
});
