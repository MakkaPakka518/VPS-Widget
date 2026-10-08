// lib/tmdb_rank.js — TMDB 趋势/热门榜（trending week + popular，zh-CN）
const { getJson } = require("./http");
const { bjStamp } = require("./util");
const tmdb = require("./tmdb");

const BASE = "https://api.themoviedb.org/3";
// key → { path, mediaType }：key 即 fetch 返回对象里的字段名
const ENDPOINTS = [
  { key: "tv",            path: "/trending/tv/week",  mediaType: "tv" },
  { key: "movie",         path: "/trending/movie/week", mediaType: "movie" },
  { key: "tv_popular",    path: "/tv/popular",        mediaType: "tv" },
  { key: "movie_popular", path: "/movie/popular",     mediaType: "movie" },
];

/** 拉单个端点并构造成条目数组（全量保留，不截断） */
async function fetchRank(ep, apiKey) {
  // authParams 已处理：v3 key 走 api_key= 查询串，eyJ token 走 Bearer
  const { params, header } = tmdb.authParams(apiKey, { language: "zh-CN" });
  try {
    const r = await getJson(`${BASE}${ep.path}?${params}`, { accept: "application/json", ...header });
    if (r.status !== 200 || !r.data) return [];
    return (r.data.results || []).map((res) => tmdb.buildInfo(res, { mediaType: ep.mediaType }));
  } catch { return []; }
}

/** 主入口 */
async function fetch(apiKey) {
  const [tv, movie, tv_popular, movie_popular] = await Promise.all(
    ENDPOINTS.map((ep) => fetchRank(ep, apiKey))
  );
  return { last_updated: bjStamp(), tv, movie, tv_popular, movie_popular };
}

module.exports = { name: "tmdb", title: "TMDB 趋势", fetch };
