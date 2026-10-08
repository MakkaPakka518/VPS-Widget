// api/data.js — 公开数据接口：/data/<src>.json（CORS + 缓存，供 widget 读取）
const kv = require("../lib/kv.js");
const reg = require("../lib/registry.js");

module.exports = async function (req, res) {
  const url = new URL(req.url, "http://x");
  const name = url.searchParams.get("src") || "";
  if (!reg.sources[name]) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "未知数据源" }));
    return;
  }
  const data = await kv.getJSON("data:" + name);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.end(JSON.stringify(data || { last_updated: "" }, null, 2));
};
