// lib/mgtv.js — 芒果TV热榜（剧集/综艺）
const { getJson } = require("./http");
const { cleanMgtv, bjStamp } = require("./util");
const tmdb = require("./tmdb");

const API = "https://pianku.api.mgtv.com/rider/list/pcweb/v3";
const REGIONS = [
  { title: "全部剧集", value: "tv", channelId: 2, limit: 150, params: { kind: "a1", area: "a1", year: "all", sort: "c1", chargeInfo: "a1" } },
  { title: "芒果王牌综艺", value: "show", channelId: 1, limit: 150, params: { kind: "a1", area: "a1", year: "all", sort: "c1" } },
];
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Referer": "https://www.mgtv.com/",
};

function yearFrom(text) {
  const m = String(text || "").match(/\b(20\d{2})\b/);
  return m ? m[1] : null;
}

async function fetchRegion(region) {
  const items = [];
  const pageSize = 30;
  const pageCount = Math.ceil(region.limit / pageSize);
  for (let p = 1; p <= pageCount; p++) {
    const qs = new URLSearchParams({ allowedpn: 1, channelId: region.channelId, pn: p, pc: pageSize, ...region.params });
    let r;
    try { r = await getJson(`${API}?${qs}`, HEADERS); } catch { break; }
    if (r.status !== 200 || !r.data) break;
    const docs = (r.data.data && r.data.data.hitDocs) || [];
    if (!docs.length) break;
    for (const doc of docs) items.push({ title: doc.title || "", card_subtitle: doc.subtitle || "" });
    if (items.length >= region.limit) { items.length = region.limit; break; }
  }
  return items;
}

async function matchOne(item, apiKey) {
  let dbTitle = cleanMgtv(item.title || "");
  let year = yearFrom(item.card_subtitle);
  if (!year) year = yearFrom(item.title);
  if (year) dbTitle = dbTitle.replace(year, "").trim();
  const results = await tmdb.search(dbTitle, { apiKey, year });
  for (const res of results) {
    const n = (res.name || "").toLowerCase();
    const o = (res.original_name || "").toLowerCase();
    const target = dbTitle.toLowerCase();
    if (!(n.includes(target) || o.includes(target) || target.includes(n))) continue;
    const fa = res.first_air_date || "";
    if (year && fa && !fa.startsWith(year)) continue;
    if (!res.poster_path || !res.backdrop_path) continue;
    const info = tmdb.buildInfo(res, { mediaType: "tv" });
    info.lastUpdateDate = (await tmdb.fetchLastAirDate(res.id, apiKey)) || fa;
    return info;
  }
  return null;
}

async function fetch(apiKey) {
  const out = { last_updated: bjStamp() };
  for (const region of REGIONS) {
    const items = await fetchRegion(region);
    const matched = [];
    for (const item of items) {
      const info = await matchOne(item, apiKey);
      if (info) matched.push(info);
    }
    out[region.value] = matched;
  }
  return out;
}

module.exports = { name: "mgtv", title: "芒果TV", fetch, REGIONS };
