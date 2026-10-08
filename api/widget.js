// api/widget.js — 公开聚合模块 /widget.js
const store = require("../lib/store.js");
const reg = require("../lib/registry.js");
const widget = require("../lib/widget.js");

module.exports = async function (req, res) {
  const cfg = await store.loadConfig();
  const base = (cfg.vpsAddress || reg.siteUrl(req)).replace(/\/+$/, "");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  res.end(widget.generate(base));
};
