// lib/http.js — 网络工具（零依赖）
const http = require("http");
const https = require("https");

/** 发 GET，返回 { status, body(string), json(object|null) } */
function request(url, headers = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { return reject(new Error("URL 非法: " + url)); }
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.get(url, { headers: Object.assign({ "Accept-Encoding": "identity" }, headers) }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(body); } catch { /* 非 JSON */ }
        resolve({ status: res.statusCode, body, json });
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("请求超时")));
  });
}

/** 拿 JSON 响应 */
async function getJson(url, headers = {}) {
  const r = await request(url, headers);
  return { status: r.status, data: r.json, body: r.body };
}

module.exports = { request, getJson };
