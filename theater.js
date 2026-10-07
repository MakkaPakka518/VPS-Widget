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

/** 正则解析豆瓣片单页：提取 .info .title / .meta 里的标题与年份 */
function parseDoulistPage(html) {
  const items = [];
  const liRe = /<li[^>]*class="[^"]*doulist-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(html))) {
    const block = m[1];
    const titleM = block.match(/class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\//i);
    if (!titleM) continue;
    const titleCn = String(titleM[1]).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!titleCn) continue;
    const metaM = block.match(/class="[^"]*meta[^"]*"[^>]*>([\s\S]*?)<\//i);
    const metaText = metaM ? String(metaM[1]).replace(/<[^>]+>/g, "") : "";
    const yearM = metaText.match(/(\d{4})(?:-\d{2}-\d{2})?/);
    items.push({ title: cleanDouban(titleCn), year: yearM ? yearM[1] : null });
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
    if (!(target in n || target in o || n in target)) continue;
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
