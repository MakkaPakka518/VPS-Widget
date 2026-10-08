// lib/registry.js — 10 源注册 + 计数 + 站点域名推导
const sources = {
  guduo: require("./guduo"),
  douban: require("./douban"),
  mgtv: require("./mgtv"),
  theater: require("./theater"),
  bangumi: require("./bangumi"),
  tmdb: require("./tmdb_rank"),
  bili: require("./bili"),
  mal: require("./mal"),
  anilist: require("./anilist"),
  trakt: require("./trakt"),
};

function countOf(name, data) {
  if (!data) return 0;
  if (name === "guduo") return Object.values(data.categories || {}).reduce((s, arr) => s + arr.length, 0);
  if (name === "bangumi") return (data.hot_anime || []).length;
  if (name === "theater") return Object.entries(data).filter(([k]) => k !== "last_updated").reduce((s, [, v]) => s + (v.aired || []).length, 0);
  return Object.entries(data).filter(([k]) => k !== "last_updated").reduce((s, [, v]) => s + (Array.isArray(v) ? v.length : 0), 0);
}

/** 当前部署站点地址（优先请求头，其次 Vercel 环境） */
function siteUrl(req) {
  const host = (req && (req.headers["x-forwarded-host"] || req.headers.host)) || process.env.VERCEL_URL || "";
  const proto = (req && req.headers["x-forwarded-proto"]) || "https";
  return host ? `${proto}://${host}` : "";
}

module.exports = { sources, countOf, siteUrl };
