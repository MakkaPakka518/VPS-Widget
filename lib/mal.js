// lib/mal.js — MAL 热播番剧（myanimelist.net topanime airing + TMDB 动画匹配）
const { request } = require("./http");
const { cleanAnime, bjStamp } = require("./util");
const tmdb = require("./tmdb");

const MAL_URL = "https://myanimelist.net/topanime.php?type=airing";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// 英文月名 → 两位数字
const MONTHS = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function text(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** 解析 ranking-list 行，零依赖正则 */
function parsePage(html) {
  const items = [];
  const trRe = /<tr[^>]*class="ranking-list"[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html))) {
    const block = m[1];

    // 排名：<span class="... rank1">1</span>，兜底取 rank 单元格
    const rankM = block.match(/<span[^>]*class="[^"]*rank\d*[^"]*"[^>]*>\s*#?\s*(\d+)/i)
      || block.match(/<td[^>]*class="[^"]*\brank\b[^"]*"[^>]*>[\s\S]*?(\d+)/i);
    const rank = rankM ? parseInt(rankM[1], 10) : items.length + 1;

    // 标题：h3 内 a[href*="/anime/<id>"]
    const titleM = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="[^"]*\/anime\/\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a[^>]*href="[^"]*\/anime\/\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleM) continue;
    const title = text(titleM[1]);
    if (!title) continue;

    // 评分：span.score-label（可能为空）
    let score = 0;
    const scoreM = block.match(/<span[^>]*class="[^"]*score-label[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (scoreM) {
      const sm = text(scoreM[1]).match(/[\d.]+/);
      if (sm) score = parseFloat(sm[0]);
    }

    // 开播日：.information div 文本内如 "Mar 2026 -"
    let startDate = "";
    const infoM = block.match(/<div[^>]*class="[^"]*information[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (infoM) {
      const dm = infoM[1].match(/([A-Z][a-z]{2})\s+(\d{4})/);
      if (dm && MONTHS[dm[1]]) startDate = `${dm[2]}-${MONTHS[dm[1]]}-01`;
    }

    items.push({ rank, title, score, startDate });
  }
  return items;
}

async function fetchRaw() {
  let r;
  try {
    r = await request(MAL_URL, { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" });
  } catch {
    return [];
  }
  if (r.status !== 200) return [];
  return parsePage(r.body);
}

async function build(res, apiKey, mediaType) {
  const base = tmdb.buildInfo(res, { mediaType });
  // 中文剧名 + 中文简介：TMDB zh-CN 详情本地化（无中文译名时回退原语言）
  const zh = await tmdb.fetchZh(res.id, { apiKey, mediaType });
  if (zh) {
    if (zh.name) base.title = zh.name;
    base.description = `${(base.releaseDate || "").slice(0, 4)} · ⭐ ${base.rating} · ${base.regionTitle}\n${zh.overview || res.overview || "暂无简介"}`;
  } else {
    base.description = `${(base.releaseDate || "").slice(0, 4)} · ⭐ ${base.rating} · ${base.regionTitle}\n${res.overview || "暂无简介"}`;
  }
  base.genreTitle = base.genreTitle.split(",").filter((g) => g !== "动画").join(" / ") || "动画";
  base.rawGenres = res.genre_ids || [];
  base.rawCountries = res.origin_country || [];
  return base;
}

/** MAL 标题本地化清洗：在共享 cleanAnime 基础上，额外去掉 "2nd Season / Part 2 / Cour II" 等续作标记，便于命中 TMDB 主番 */
function malClean(t) {
  let s = cleanAnime(t);
  s = s.replace(/\d+(?:st|nd|rd|th)\s+season/gi, "")   // 2nd Season / 3rd Season
    .replace(/season\s+\d+/gi, "")                       // Season 2
    .replace(/\b(part|cour|course)\s+[IVXLC0-9]+/gi, "") // Part 2 / Cour II
    .replace(/[-–—:：]\s*$/, "")
    .replace(/\s+/g, " ").trim();
  return s;
}

/** 宽松标题包含兜底：双图 + 优先动漫(genre 16)。先比主名(name/title)，再比原名(original)，主番优先 */
function looseMatch(results, title) {
  const target = String(title || "").toLowerCase();
  if (!target || target.length < 3) return null;
  const pool = (results || [])
    .filter((r) => r.poster_path && r.backdrop_path)
    .filter((r) => (r.genre_ids || []).includes(16));
  if (!pool.length) return null;
  const hit = (r) => {
    const n = (r.name || r.title || "").toLowerCase();
    const o = (r.original_name || r.original_title || "").toLowerCase();
    return { n, o };
  };
  // 第一遍：主名直接包含
  for (const res of pool) { const { n } = hit(res); if (n.includes(target)) return res; }
  // 第二遍：原名包含
  for (const res of pool) { const { o } = hit(res); if (o.includes(target)) return res; }
  return null;
}

/** TMDB 匹配：en-US 搜索（英文/罗马音主名与 MAL 标题对齐）。TV 严格→TV 宽松；TV 无带海报动漫候选才试剧场版 */
async function matchOne(title, apiKey) {
  const tvRes = await tmdb.search(title, { apiKey, lang: "en-US" });
  let res = tmdb.strictMatch(tvRes, title, null, { requireGenre: 16, notYetAired: true });
  if (res) return await build(res, apiKey, "tv");
  res = looseMatch(tvRes, title);
  if (res) return await build(res, apiKey, "tv");

  const tvHasAnime = tvRes.some((r) => r.poster_path && r.backdrop_path && (r.genre_ids || []).includes(16));
  if (tvHasAnime) return null;

  const mvRes = await tmdb.search(title, { apiKey, isMovie: true, lang: "en-US" });
  res = tmdb.strictMatch(mvRes, title, null, { requireGenre: 16, notYetAired: true });
  if (res) return await build(res, apiKey, "movie");
  res = looseMatch(mvRes, title);
  if (res) return await build(res, apiKey, "movie");
  return null;
}

/** 主入口 */
async function fetch(apiKey) {
  const raw = await fetchRaw();
  const airing = [];
  for (const it of raw) {
    const cleaned = malClean(it.title);
    let info = null;
    try { info = await matchOne(cleaned, apiKey); } catch { info = null; }
    if (info) {
      info.rank = it.rank;
      info.heat = it.score;
      airing.push(info);
    }
    // 无 TMDB 匹配的条目跳过：缺 tmdbId/poster，Rex 无法解析为 TMDB（id=0、无海报）
  }
  return { last_updated: bjStamp(), airing };
}

module.exports = { name: "mal", title: "MAL 热播番剧", fetch, parsePage };
