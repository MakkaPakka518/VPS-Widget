// lib/guduo.js — 骨朵热度榜（剧集/综艺/动漫/电影 4 分类）
const { getJson } = require("./http");
const { cleanGuduo, bjYesterday, bjStamp } = require("./util");
const tmdb = require("./tmdb");

const Y = bjYesterday(); // 骨朵数据只有前一天的
const URLS = {
  "剧集": `https://d2.guduomedia.com/m/v3/billboard/list?type=DAILY&category=NETWORK_DRAMA&date=${Y}&attach=gdi&orderTitle=gdi&platformId=0`,
  "综艺": `https://d2.guduomedia.com/m/v3/billboard/list?type=DAILY&category=NETWORK_VARIETY&date=${Y}&attach=gdi&orderTitle=gdi&platformId=0`,
  "动漫": `https://d2.guduomedia.com/m/v3/billboard/list?type=DAILY&category=ALL_ANIME&date=${Y}&attach=gdi&orderTitle=gdi&platformId=0`,
  "电影": `https://d2.guduomedia.com/m/v3/billboard/list?type=DAILY&category=NETWORK_MOVIE&date=${Y}&attach=gdi&orderTitle=gdi&platformId=0`,
};
const MAX_TOP = 30; // 每分类取前 30
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchCategory(category, url) {
  let r;
  try { r = await getJson(url, { "User-Agent": UA }); } catch { return []; }
  if (r.status !== 200 || !r.data) return [];
  const raw = r.data.data || [];
  return raw.slice(0, MAX_TOP).map((item, i) => ({
    title: item.name || "未知名称",
    rank: i + 1,
    heat: item.gdi || 0,
    category,
  }));
}

async function searchTv(query, apiKey) {
  const results = await tmdb.search(query, { apiKey });
  return results;
}

async function matchItem(item, apiKey) {
  const cleanT = cleanGuduo(item.title);
  const category = item.category;
  let best = null;
  let mediaType = "tv";

  if (category === "电影") {
    const res = await tmdb.search(cleanT, { apiKey, isMovie: true });
    best = res[0];
    mediaType = "movie";
  } else if (category === "剧集") {
    let res = await tmdb.search(cleanT, { apiKey });
    if (!res.length) { res = await tmdb.search(cleanT, { apiKey, isMovie: true }); mediaType = "movie"; }
    best = res[0];
  } else if (category === "综艺") {
    let res = await tmdb.search(cleanT, { apiKey });
    const variety = res.filter((r) => (r.genre_ids || []).some((g) => g === 10764 || g === 10767));
    best = (variety.length ? variety : res)[0];
  } else if (category === "动漫") {
    let res = await tmdb.search(cleanT, { apiKey });
    let anime = res.filter((r) => (r.genre_ids || []).includes(16));
    if (!anime.length) { res = await tmdb.search(cleanT, { apiKey, isMovie: true }); anime = res.filter((r) => (r.genre_ids || []).includes(16)); }
    best = anime[0];
  }

  if (!best) return null;
  const base = tmdb.buildInfo(best, { mediaType });
  return { ...item, ...base };
}

async function fetch(apiKey) {
  const categories = {};
  for (const [cat, url] of Object.entries(URLS)) {
    const list = await fetchCategory(cat, url);
    const matched = [];
    for (const item of list) {
      const info = await matchItem(item, apiKey);
      if (info) matched.push(info);
    }
    categories[cat] = matched;
  }
  return { source: "Guduo Media", billboard_date: Y, last_updated: bjStamp(), categories };
}

module.exports = { name: "guduo", title: "骨朵热度", fetch, fetchCategory };
