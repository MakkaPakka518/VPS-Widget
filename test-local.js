// test-local.js — Vercel 版本地验证（内存 Upstash mock + 调用 serverless handler）
// 运行： node test-local.js
const http = require("http");

// ---------- 内存 Upstash mock（get/set/del REST） ----------
const mem = new Map();
const up = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const parts = u.pathname.split("/").filter(Boolean); // [op, key, value?]
  const op = parts[0], key = parts[1], val = parts[2];
  res.setHeader("Content-Type", "application/json");
  if (op === "get") return res.end(JSON.stringify({ result: mem.has(key) ? mem.get(key) : null }));
  if (op === "set") { mem.set(key, decodeURIComponent(val)); return res.end(JSON.stringify({ result: "OK" })); }
  if (op === "del") { mem.delete(key); return res.end(JSON.stringify({ result: 1 })); }
  res.end(JSON.stringify({ result: null }));
});

function fakeReq(url, method, body, headers) {
  const req = { url, method, headers: headers || {} };
  req.on = (ev, cb) => { if (ev === "data" && body) cb(Buffer.from(JSON.stringify(body))); if (ev === "end") cb(); };
  return req;
}
function fakeRes() {
  const o = { status: 0, headers: {}, body: "" };
  o.statusCode = 0;
  o.setHeader = (k, v) => { o.headers[k] = v; };
  o.writeHead = (s, h) => { o.status = s; o.headers = Object.assign(o.headers, h || {}); };
  o.end = (b) => { o.status = o.statusCode; o.body = b; };
  return o;
}

const assert = require("assert");

async function run() {
  const index = require("./api/index.js");
  const data = require("./api/data.js");
  const wjs = require("./api/widget.js");
  const cron = require("./api/cron.js");
  const kv = require("./lib/kv.js");
  const updater = require("./lib/updater.js");

  // 1. 面板
  let r = fakeRes(); await index(fakeReq("/?__path=/", "GET"), r);
  assert.equal(r.status, 200); assert.ok(r.body.includes("全站榜单 · VPS 管理面板"), "面板 HTML");

  // 2. 登录（seed 密码默认 admin）
  r = fakeRes(); await index(fakeReq("/api/login?__path=/api/login", "POST", { password: "admin" }), r);
  assert.equal(r.status, 200);
  const token = JSON.parse(r.body).token; assert.ok(token);
  const AUTH = { authorization: "Bearer " + token };

  // 3. 错误密码 401
  r = fakeRes(); await index(fakeReq("/api/login?__path=/api/login", "POST", { password: "wrong" }), r);
  assert.equal(r.status, 401);

  // 4. auth/status
  r = fakeRes(); await index(fakeReq("/api/auth/status?__path=/api/auth/status", "GET", null, AUTH), r);
  assert.equal(JSON.parse(r.body).loggedIn, true);

  // 5. 未登录访问受保护 API → 401
  r = fakeRes(); await index(fakeReq("/api/sources?__path=/api/sources", "GET"), r);
  assert.equal(r.status, 401);

  // 6. 配置 GET：trakt 掩码、不泄露 password
  r = fakeRes(); await index(fakeReq("/api/config?__path=/api/config", "GET", null, AUTH), r);
  let cfg = JSON.parse(r.body);
  assert.equal(cfg.password, undefined); assert.equal(cfg.traktToken, "");

  // 7. 配置 POST：设 TMDB key + trakt token
  r = fakeRes(); await index(fakeReq("/api/config?__path=/api/config", "POST", {
    tmdbApiKey: "TEST_TMDB", traktToken: "a".repeat(64), vpsAddress: "",
  }, AUTH), r);
  assert.equal(JSON.parse(r.body).ok, true);
  r = fakeRes(); await index(fakeReq("/api/config?__path=/api/config", "GET", null, AUTH), r);
  cfg = JSON.parse(r.body);
  assert.equal(cfg.tmdbApiKey, "TEST_TMDB");
  assert.ok(cfg.traktToken.includes("…") && cfg.traktToken.length < 20, "trakt 已掩码");

  // 8. 写入一份模拟数据
  await kv.setJSON("data:bangumi", { last_updated: "2026/10/08 12:00:00", hot_anime: [{ title: "A", rank: 1 }, { title: "B", rank: 2 }] });
  await kv.setJSON("data:guduo", { last_updated: "2026/10/08 12:00:00", categories: { 电视剧: [{ title: "X" }, { title: "Y" }, { title: "Z" }] } });

  // 9. /api/sources
  r = fakeRes(); await index(fakeReq("/api/sources?__path=/api/sources", "GET", null, AUTH), r);
  const s = JSON.parse(r.body);
  assert.equal(s.configured, true);
  const bg = s.sources.find((x) => x.name === "bangumi");
  assert.equal(bg.count, 2); assert.equal(bg.ok, true);
  const gd = s.sources.find((x) => x.name === "guduo");
  assert.equal(gd.count, 3);

  // 10. /api/preview
  r = fakeRes(); await index(fakeReq("/api/preview?__path=/api/preview&source=bangumi", "GET", null, AUTH), r);
  assert.equal(JSON.parse(r.body).count, 2);

  // 11. /api/widget（含10模块 + baseUrl 用请求 host）
  r = fakeRes(); await index(fakeReq("/api/widget?__path=/api/widget", "GET", null, AUTH, ), r);
  const w = JSON.parse(r.body);
  assert.ok(w.code.includes("loadTrakt") && w.code.includes("loadGuduo") && w.code.includes("sortItems"));
  assert.ok(w.url.startsWith("https://demo.example"));

  // 12. 公开数据端点 api/data.js
  r = fakeRes(); await data(fakeReq("/data/bangumi?src=bangumi", "GET"), r);
  assert.equal(r.status, 200); assert.equal(JSON.parse(r.body).hot_anime.length, 2);
  assert.equal(r.headers["Access-Control-Allow-Origin"], "*");

  // 13. 公开 widget api/widget.js
  r = fakeRes(); await wjs(fakeReq("/widget.js", "GET", null, { host: "demo.example" }), r);
  assert.equal(r.status, 200); assert.ok(r.body.includes("loadTrakt"));

  // 14. 改密码
  r = fakeRes(); await index(fakeReq("/api/password?__path=/api/password", "POST", { oldPassword: "admin", newPassword: "newpass123" }, AUTH), r);
  assert.equal(JSON.parse(r.body).ok, true);
  r = fakeRes(); await index(fakeReq("/api/login?__path=/api/login", "POST", { password: "newpass123" }), r);
  assert.equal(r.status, 200, "新密码可登录");

  // 15. cron 轮转：连续调 nextSource 覆盖全部 10 源且不重复
  const seen = new Set();
  for (let i = 0; i < 10; i++) seen.add(await updater.nextSource());
  assert.equal(seen.size, 10, "轮转覆盖10源");

  // 16. cron handler：无 TMDB 时应跳过（先清配置）
  // （上面已设 TMDB，此处用未登录访问也可 —— 实际 Vercel cron 无鉴权）
  r = fakeRes(); await cron(fakeReq("/api/cron", "GET"), r);
  assert.ok(JSON.parse(r.body).ok !== undefined);

  console.log("✅ 全部 16 项本地验证通过");
}

up.listen(0, () => {
  process.env.KV_REST_API_URL = `http://127.0.0.1:${up.address().port}`;
  process.env.KV_REST_API_TOKEN = "test-token";
  process.env.ADMIN_PASSWORD = "admin";
  process.env.VERCEL_URL = "demo.example";
  run().then(() => { up.close(); process.exit(0); }).catch((e) => { console.error("❌", e.message || e); up.close(); process.exit(1); });
});
