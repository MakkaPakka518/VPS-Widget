// lib/tmdb.js — TMDB 搜索与条目构建
const { getJson } = require("./http");
const { todayString } = require("./util");

const TMDB_SEARCH_TV = "https://api.themoviedb.org/3/search/tv";
const TMDB_SEARCH_MOVIE = "https://api.themoviedb.org/3/search/movie";
const TMDB_DETAIL_TV = "https://api.themoviedb.org/3/tv/";

const GENRE_MAP = { 28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片", 18: "剧情", 10751: "家庭", 14: "奇幻", 36: "历史", 27: "恐怖", 10402: "音乐", 9648: "悬疑", 10749: "爱情", 878: "科幻", 10770: "电视电影", 53: "惊悚", 10752: "战争", 37: "西部", 10759: "动作冒险", 10762: "儿童", 10763: "新闻", 10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀", 10768: "战争政治" };
const COUNTRY_MAP = { CN: "中国大陆", JP: "日本", KR: "韩国", US: "美国", GB: "英国", TW: "中国台湾", HK: "中国香港" };

function authParams(apiKey, params) {
  const p = new URLSearchParams(params);
  if (String(apiKey || "").startsWith("eyJ")) return { params: p, header: { Authorization: "Bearer " + apiKey } };
  p.set("api_key", apiKey);
  return { params: p, header: {} };
}

/** 底层搜索，返回 TMDB results 原始数组 */
async function search(query, { apiKey, isMovie = false, year, lang = "zh-CN" } = {}) {
  const base = isMovie ? TMDB_SEARCH_MOVIE : TMDB_SEARCH_TV;
  const { params, header } = authParams(apiKey, { query, language: lang });
  if (year) params.set(isMovie ? "primary_release_year" : "first_air_date_year", year);
  try {
    const r = await getJson(`${base}?${params}`, { accept: "application/json", ...header });
    if (r.status !== 200 || !r.data) return [];
    return r.data.results || [];
  } catch { return []; }
}

/** 拿 tv 详情，取最新播出日期 last_air_date */
async function fetchLastAirDate(tvId, apiKey) {
  try {
    const { params, header } = authParams(apiKey, { language: "zh-CN" });
    const r = await getJson(`${TMDB_DETAIL_TV}${tvId}?${params}`, { accept: "application/json", ...header });
    if (r.status !== 200 || !r.data) return "";
    return r.data.last_air_date || "";
  } catch { return ""; }
}

/** 把一条 TMDB 结果构造成榜单条目（各源共用的增强字段） */
function buildInfo(res, { mediaType, needDetail = false, apiKey } = {}) {
  const isMovie = !!res.title; // TMDB: movie 结果用 title，tv 用 name
  const mType = mediaType || (isMovie ? "movie" : "tv");
  const fa = res.first_air_date || res.release_date || "";
  const genreIds = res.genre_ids || [];
  const genres = genreIds.map((g) => GENRE_MAP[g]).filter(Boolean).slice(0, 3);
  const region = (res.origin_country || []).map((c) => COUNTRY_MAP[c] || c).join("/") || "未知地区";
  const score = Math.round(Number(res.vote_average || 0) * 10) / 10;
  const info = {
    id: String(res.id),
    tmdbId: res.id,
    type: "tmdb",
    mediaType: mType,
    title: res.name || res.title,
    description: res.overview || "",
    rating: score,
    voteCount: res.vote_count || 0,
    popularity: res.popularity || 0,
    releaseDate: fa,
    lastUpdateDate: fa,
    posterPath: res.poster_path,
    backdropPath: res.backdrop_path,
    genreTitle: genres.join(","),
    regionTitle: region,
  };
  if (mType === "tv" && info.genreTitle) {
    // 保留原脚本：动漫外的类型名
  }
  if (info.genreTitle === "") info.genreTitle = isMovie ? "" : "";
  return info;
}

/** 严格标题+年份匹配，返回第一条命中（需双图） */
function strictMatch(results, title, year, { requireGenre, notYetAired = false } = {}) {
  const target = String(title || "").toLowerCase();
  const today = todayString();
  for (const res of results) {
    const n = (res.name || "").toLowerCase();
    const o = (res.original_name || "").toLowerCase();
    if (!(n.includes(target) || o.includes(target) || target.includes(n))) continue;
    const fa = res.first_air_date || res.release_date || "";
    if (year && fa && !fa.startsWith(year)) continue;
    if (!res.poster_path || !res.backdrop_path) continue;
    if (requireGenre && !(res.genre_ids || []).includes(requireGenre)) continue;
    if (notYetAired && (!fa || fa > today)) continue;
    return res;
  }
  return null;
}

module.exports = { search, fetchLastAirDate, buildInfo, strictMatch, GENRE_MAP, COUNTRY_MAP, authParams };
