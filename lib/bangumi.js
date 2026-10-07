// lib/bangumi.js — 番剧榜（bgm.tv 排名榜 + TMDB 动画匹配）
const { getJson } = require("./http");
const { cleanAnime, bjStamp } = require("./util");
const tmdb = require("./tmdb");

const BGM_BASE = "https://bgm.tv/anime/browser?sort=rank"; // 公开排名榜（sort=collects 需登录）
const MAX_PAGES = 2;   // 抓取页数
const MAX_ITEMS = 40;  // 最多匹配条数
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parsePage(html) {
  const items = [];
  const liRe = /<li[^>]*class="item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(html))) {
    const block = m[1];
    const titleM = block.match(/<a[^>]*class="[^"]*\bl\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleM) continue;
    const titleCn = String(titleM[1]).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!titleCn) continue;
    const origM = block.match(/<small[^>]*class="grey"[^>]*>([\s\S]*?)<\/small>/i);
    const orig = origM ? String(origM[1]).replace(/<[^>]+>/g, "").trim() : titleCn;
    const infoM = block.match(/<p[^>]*class="info[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const infoText = infoM ? String(infoM[1]).replace(/<[^>]+>/g, " ") : "";
    const yearM = infoText.match(/(\d{4})年/) || infoText.match(/\b(19|20)\d{2}\b/);
    items.push({ title: titleCn, original_title: orig, year: yearM ? yearM[1] : null });
  }
  return items;
}

async function fetchRaw() {
  const items = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    let r;
    try { r = await getJson(`${BGM_BASE}&page=${p}`, { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" }); }
    catch { continue; }
    if (r.status !== 200) continue;
    items.push(...parsePage(r.body));
    if (items.length >= MAX_ITEMS) break;
  }
  return items.slice(0, MAX_ITEMS);
}

function build(res, apiKey, mediaType) {
  const base = tmdb.buildInfo(res, { mediaType });
  base.description = `${(base.releaseDate || "").slice(0, 4)} · ⭐ ${base.rating} · ${base.regionTitle}\n${res.overview || "暂无简介"}`;
  base.genreTitle = base.genreTitle.split(",").filter((g) => g !== "动画").join(" / ") || "动画";
  base.rawGenres = res.genre_ids || [];
  base.rawCountries = res.origin_country || [];
  return base;
}

async function matchOne(title, year, apiKey) {
  // TV 优先
  let res = tmdb.strictMatch(await tmdb.search(title, { apiKey, year }), title, year, { requireGenre: 16, notYetAired: true });
  if (res) return build(res, apiKey, "tv");
  // 可能是剧场版电影
  res = tmdb.strictMatch(await tmdb.search(title, { apiKey, isMovie: true, year }), title, year, { requireGenre: 16, notYetAired: true });
  if (res) return build(res, apiKey, "movie");
  return null;
}

/** 主入口 */
async function fetch(apiKey) {
  const raw = await fetchRaw();
  const hot = [];
  for (const it of raw) {
    const cn = cleanAnime(it.title);
    const orig = cleanAnime(it.original_title);
    let info = await matchOne(cn, it.year, apiKey);
    if (!info && orig !== cn) info = await matchOne(orig, it.year, apiKey);
    if (info) hot.push(info);
  }
  return { last_updated: bjStamp(), total_matched: hot.length, hot_anime: hot };
}

module.exports = { name: "bangumi", title: "番剧", fetch, parsePage };
