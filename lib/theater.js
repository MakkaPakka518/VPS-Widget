// lib/theater.js — 剧场平台（豆瓣片单，15 个剧场）
const { getJson } = require("./http");
const { cleanDouban, todayString, bjStamp } = require("./util");
const tmdb = require("./tmdb");

const THEATERS = [
  { name: "迷雾剧场", id: "128396349" }, { name: "白夜剧场", id: "158539495" },
  { name: "X剧场", id: "155026800" }, { name: "玛卡巴卡的悬疑剧", id: "160885987" },
  { name: "横屏短剧", id: "152299516" }, { name: "生花剧场", id: "159069554" },
  { name: "大家剧场", id: "160644809" }, { name: "小逗剧场", id: "146055365" },
  { name: "十分剧场", id: "147708618" }, { name: "板凳单元", id: "163392459" },
  { name: "萤火单元", id: "163549603" }, { name: "正午阳光", id: "125370543" },
  { name: "恋恋剧场", id: "156086548" }, { name: "悬疑剧场", id: "128400108" },
  { name: "微尘剧场", id: "161658331" },
];
const PAGE_SIZE = 25;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

/** 解析豆瓣片单页：定位 doulist-items 列表，提取 .title 与 .meta 里的标题和年份 */
function parseDoulistPage(html) {
  const items = [];
  const ulM = String(html).match(/<ul[^>]*class="[^"]*doulist-items[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
  if (!ulM) return items;
  const block = ulM[1];
  const liRe = /<li>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(block))) {
    const it = m[1];
    const titleM = it.match(/<h2[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
    if (!titleM) continue;
    const title = String(titleM[1]).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!title) continue;
    const metaM = it.match(/<div[^>]*class="[^"]*meta[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const metaText = metaM ? String(metaM[1]).replace(/<[^>]+>/g, "") : "";
    const yearM = metaText.match(/(\d{4})/);
    items.push({ title: cleanDouban(title), year: yearM ? yearM[1] : null });
  }
  return items;
}

async function fetchTheater(theater) {
  const items = [];
  let start = 0;
  let pages = 0;
  while (true) {
    pages++;
    const url = `https://m.douban.com/doulist/${theater.id}/?start=${start}`;
    let r;
    try { r = await getJson(url, HEADERS); } catch { break; }
    if (r.status !== 200) break;
    const pageItems = parseDoulistPage(r.body);
    if (!pageItems.length) break;
    items.push(...pageItems);
    if (pageItems.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }
  return { items, pages };
}

async function matchOne(item, apiKey) {
  const today = todayString();
  const results = await tmdb.search(item.title, { apiKey, year: item.year });
  for (const res of results) {
    const n = (res.name || "").toLowerCase();
    const o = (res.original_name || "").toLowerCase();
    const target = String(item.title).toLowerCase();
    if (!(n.includes(target) || o.includes(target) || target.includes(n))) continue;
    const fa = res.first_air_date || "";
    if (item.year && fa && !fa.startsWith(item.year)) continue;
    if (!res.poster_path || !res.backdrop_path) continue;
    if (!fa || fa > today) continue; // 拦截未开播
    const info = tmdb.buildInfo(res, { mediaType: "tv" });
    info.lastUpdateDate = (await tmdb.fetchLastAirDate(res.id, apiKey)) || fa;
    return info;
  }
  return null;
}

async function fetch(apiKey) {
  const out = { last_updated: bjStamp() };
  for (const theater of THEATERS) {
    const { items, pages } = await fetchTheater(theater);
    const aired = [];
    for (const item of items) {
      const info = await matchOne(item, apiKey);
      if (info) aired.push(info);
    }
    aired.sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")));
    out[theater.name] = { aired, upcoming: [], totalItems: items.length, totalPages: pages };
  }
  return out;
}

module.exports = { name: "theater", title: "剧场平台", fetch, THEATERS, parseDoulistPage };
