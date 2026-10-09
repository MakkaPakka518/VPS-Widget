// lib/anilist.js — AniList 番剧趋势（GraphQL POST + TMDB 动画匹配）
const https = require("https");
const { cleanAnime, bjStamp } = require("./util");
const tmdb = require("./tmdb");

const ANILIST_URL = "https://graphql.anilist.co";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const GRAPHQL_QUERY =
  "query{Page(page:1,perPage:30){media(sort:TRENDING_DESC,type:ANIME){id title{romaji english native} averageScore coverImage{large} startDate{year month day} genres format}}}";

/** 发 JSON POST（node 内置 https，零依赖），返回 { status, json } */
function postJson(url, bodyObj, headers = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { return reject(new Error("URL 非法: " + url)); }
    const body = Buffer.from(JSON.stringify(bodyObj), "utf8");
    const req = https.request(
      u,
      {
        method: "POST",
        headers: Object.assign(
          {
            "Content-Type": "application/json",
            "Content-Length": body.length,
            "User-Agent": UA,
            Accept: "application/json",
          },
          headers
        ),
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { /* 非 JSON */ }
          resolve({ status: res.statusCode, body: text, json });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("请求超时")));
    req.end(body);
  });
}

/** startDate {year,month,day} -> "YYYY-MM-DD"，缺月/日容错 */
function fmtDate(sd) {
  if (!sd || !sd.year) return "";
  const y = sd.year;
  const m = sd.month ? String(sd.month).padStart(2, "0") : "01";
  const d = sd.day ? String(sd.day).padStart(2, "0") : "01";
  return `${y}-${m}-${d}`;
}

/** 从 title 对象取候选标题：english 优先（TMDB 英文库命中高），再 romaji，最后 native */
function titleCandidates(t) {
  const out = [];
  const push = (x) => { const s = cleanAnime(x); if (s && !out.includes(s)) out.push(s); };
  push(t && t.english);
  push(t && t.romaji);
  push(t && t.native);
  return out;
}

/** 命中后本地化：拉 TMDB zh-CN 详情，用中文剧名/中文简介覆盖 */
async function localize(res, mediaType, apiKey) {
  const info = tmdb.buildInfo(res, { mediaType });
  const zh = await tmdb.fetchZh(res.id, { apiKey, mediaType });
  if (zh) {
    if (zh.name) info.title = zh.name;
    if (zh.overview) info.description = zh.overview;
  }
  return info;
}

/** TMDB 匹配：动画 TV 优先，剧场版兜底；requireGenre 16 严格匹配，标题包含兜底 */
async function tryOne(title, year, apiKey) {
  // TV 严格匹配（要求动画类型 16）
  let res = tmdb.strictMatch(await tmdb.search(title, { apiKey, year }), title, year, { requireGenre: 16, notYetAired: true });
  if (res) return await localize(res, "tv", apiKey);
  // 剧场版电影
  res = tmdb.strictMatch(await tmdb.search(title, { apiKey, isMovie: true, year }), title, year, { requireGenre: 16, notYetAired: true });
  if (res) return await localize(res, "movie", apiKey);
  return null;
}

async function matchOne(cands, year, apiKey) {
  // 第一轮：带年份严格匹配（新作首播）
  for (const title of cands) {
    const info = await tryOne(title, year, apiKey);
    if (info) return info;
  }
  // 第二轮：去年份兜底（续作/新季在 TMDB 共用首播条目，年份会被过滤掉）
  for (const title of cands) {
    const info = await tryOne(title, null, apiKey);
    if (info) return info;
  }
  return null;
}

/** 主入口 */
async function fetch(apiKey) {
  const r = await postJson(ANILIST_URL, { query: GRAPHQL_QUERY, variables: {} });
  const media = (r.json && r.json.data && r.json.data.Page && r.json.data.Page.media) || [];

  const trending = [];
  let rank = 0;
  for (const it of media) {
    rank += 1;
    const score = Number(it.averageScore) || 0; // null → 0 容错
    const releaseDate = fmtDate(it.startDate);
    const year = releaseDate ? releaseDate.slice(0, 4) : null;
    const cands = titleCandidates(it.title);
    const primary = cands[0] || (it.title && it.title.romaji) || "未知";

    const info = await matchOne(cands, year, apiKey);
    if (info) {
      info.rank = rank;
      info.heat = score;
      info.popularity = score;
      trending.push(info);
    }
    // 无 TMDB 匹配的条目跳过：缺 tmdbId/poster，Rex 无法解析为 TMDB（id=0、无海报）
  }

  return { last_updated: bjStamp(), total: trending.length, trending };
}

module.exports = { name: "anilist", title: "AniList 番剧", fetch };
