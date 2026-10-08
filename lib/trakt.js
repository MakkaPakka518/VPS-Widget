// lib/trakt.js — Trakt 榜单（趋势/热门 剧集+电影，ids.tmdb 匹配 TMDB 详情）
// 鉴权实测（VPS）：最小可用头 = trakt-api-version:2 + trakt-api-key:<traktToken> + Accept:application/json
//   绝不能带 Authorization: Bearer（实测带 Bearer 反而 401 Unauthorized）。
//   该 64 位 token 实际作为 client_id / API key 使用（公开榜单接口）。
const { getJson } = require("./http");
const { bjStamp } = require("./util");
const tmdb = require("./tmdb");

const TRAKT_BASE = "https://api.trakt.tv";
const TMDB_DETAIL = { tv: "https://api.themoviedb.org/3/tv/", movie: "https://api.themoviedb.org/3/movie/" };
const LIMIT = 30;

/** Trakt 请求头（按实测固定，不带 Authorization） */
function traktHeaders(traktToken) {
  return {
    "trakt-api-version": "2",
    "trakt-api-key": traktToken,
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "vps-bangumi/1.0",
  };
}

/** 拉一个榜单列表，失败/非 200/非数组都返回 [] */
async function fetchTrakt(path, traktToken) {
  try {
    const r = await getJson(`${TRAKT_BASE}${path}?limit=${LIMIT}`, traktHeaders(traktToken));
    if (r.status !== 200 || !Array.isArray(r.data)) return [];
    return r.data;
  } catch { return []; }
}

/**
 * 统一拆出 { title, year, tmdbId, heat }
 * trending 条目是 { watchers, show|movie:{...} } 包装；popular 是扁平 {...}
 */
function normalize(raw, kind) {
  const node = (raw && (raw[kind] || raw)) || {};
  const title = node.title;
  const year = node.year;
  const tmdbId = node.ids && node.ids.tmdb;
  const heat = (raw && raw.watchers) || 0; // trending 才有 watchers
  return { title, year, tmdbId, heat };
}

/** 用 ids.tmdb 调 TMDB 详情，buildInfo 构造完整条目 */
async function enrich(tmdbId, apiKey, mediaType, rank, heat) {
  try {
    const { params, header } = tmdb.authParams(apiKey, { language: "zh-CN" });
    const r = await getJson(`${TMDB_DETAIL[mediaType]}${tmdbId}?${params}`, { accept: "application/json", ...header });
    if (r.status !== 200 || !r.data) return null;
    const info = tmdb.buildInfo(r.data, { mediaType });
    // TMDB 详情返回 genres:[{id,name}] 而非 genre_ids，补中文类型
    const genres = (r.data.genres || []).map((g) => tmdb.GENRE_MAP[g.id]).filter(Boolean).slice(0, 3);
    if (genres.length) info.genreTitle = genres.join(",");
    info.rank = rank;
    info.heat = heat;
    return info;
  } catch { return null; }
}

/** 无 tmdbId 或详情失败 → 保留最小字段（仍计入榜单） */
function fallback(title, rank, year, heat) {
  const y = String(year || "").slice(0, 4);
  return {
    title: title || "未知",
    rank,
    year: y || null,
    rating: 0,
    heat: heat || 0,
    popularity: 0,
    releaseDate: y ? `${y}-01-01` : "",
  };
}

/** 把一个 Trakt 列表转成条目数组（全部保留） */
async function buildList(rawArr, kind, apiKey) {
  const out = [];
  let rank = 0;
  for (const raw of rawArr || []) {
    rank += 1;
    const { title, year, tmdbId, heat } = normalize(raw, kind);
    // Trakt 用 "show"，TMDB 详情端点/buildInfo 用 "tv"
    const mType = kind === "show" ? "tv" : "movie";
    const info = tmdbId ? await enrich(tmdbId, apiKey, mType, rank, heat) : null;
    out.push(info || fallback(title, rank, year, heat));
  }
  return out;
}

/**
 * 主入口
 * @param {string} apiKey TMDB key（eyJ 开头走 Bearer，否则 api_key 查询参数）
 * @param {string} traktToken Trakt client_id（config.json 的 traktToken）
 */
async function fetch(apiKey, traktToken) {
  if (!traktToken) throw new Error("未配置 Trakt Token");
  const [showsTrending, showsPopular, moviesTrending, moviesPopular] = await Promise.all([
    fetchTrakt("/shows/trending", traktToken),
    fetchTrakt("/shows/popular", traktToken),
    fetchTrakt("/movies/trending", traktToken),
    fetchTrakt("/movies/popular", traktToken),
  ]);
  const [trending, popular, movie_trending, movie_popular] = await Promise.all([
    buildList(showsTrending, "show", apiKey),
    buildList(showsPopular, "show", apiKey),
    buildList(moviesTrending, "movie", apiKey),
    buildList(moviesPopular, "movie", apiKey),
  ]);
  return {
    last_updated: bjStamp(),
    trending,
    popular,
    movie_trending,
    movie_popular,
  };
}

module.exports = { name: "trakt", title: "Trakt 榜单", fetch };
