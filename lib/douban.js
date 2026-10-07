// lib/douban.js — 豆瓣热榜（9 个区域）
const { getJson } = require("./http");
const { cleanDouban, bjStamp } = require("./util");
const tmdb = require("./tmdb");

const API = "https://m.douban.com/rexxar/api/v2/subject/recent_hot/tv";
const REGIONS = [
  { title: "全部剧集", type: "tv", limit: 300 },
  { title: "大陆剧集", type: "tv_domestic", limit: 150 },
  { title: "欧美剧集", type: "tv_american", limit: 150 },
  { title: "日剧", type: "tv_japanese", limit: 150 },
  { title: "韩剧", type: "tv_korean", limit: 150 },
  { title: "动漫", type: "tv_animation", limit: 150 },
  { title: "纪录片", type: "tv_documentary", limit: 150 },
  { title: "大陆综艺", type: "show_domestic", limit: 150 },
  { title: "国外综艺", type: "show_foreign", limit: 150 },
];
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Referer": "https://m.douban.com/movie/",
};

async function fetchRegion(region) {
  const qs = new URLSearchParams({ start: 0, limit: region.limit, type: region.type });
  let r;
  try { r = await getJson(`${API}?${qs}`, HEADERS); } catch { return []; }
  if (r.status !== 200 || !r.data) return [];
  return r.data.items || [];
}

function yearFromSubtitle(subtitle) {
  const first = String(subtitle || "").split("/")[0].trim();
  return /^\d{4}$/.test(first) ? first : null;
}

async function matchOne(item, apiKey) {
  const dbTitle = cleanDouban(item.title || "");
  const year = yearFromSubtitle(item.card_subtitle);
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
    out[region.type] = matched;
  }
  return out;
}

module.exports = { name: "douban", title: "豆瓣热榜", fetch, REGIONS };
