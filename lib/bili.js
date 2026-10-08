// lib/bili.js — B站榜单（PGC 番剧/国创榜 + 视频榜动画/电视剧/电影/纪录片，TMDB 匹配）
const { getJson } = require("./http");
const { cleanAnime, cleanBrackets, bjStamp } = require("./util");
const tmdb = require("./tmdb");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  Referer: "https://www.bilibili.com/",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

const PGC_RANK = "https://api.bilibili.com/pgc/web/rank/list";
const VIDEO_RANK = "https://api.bilibili.com/x/web-interface/ranking/v2";

// 只保留 PGC 番剧榜 + PGC 国创榜（去掉视频榜动画/电视剧/电影/纪录片）
const CATS = [
  { key: "bangumi", kind: "pgc", season_type: 1, mediaType: "tv", requireGenre: 16 }, // PGC 番剧榜
  { key: "guochuang", kind: "pgc", season_type: 4, mediaType: "tv", requireGenre: 16 }, // PGC 国创榜
];

/** 拉 PGC 榜（番剧/国创），返回原始 result.list[] */
async function fetchPgc(seasonType) {
  const qs = new URLSearchParams({ day: 3, season_type: String(seasonType) });
  try {
    const r = await getJson(`${PGC_RANK}?${qs}`, HEADERS);
    if (r.status !== 200 || !r.data || r.data.code !== 0) return [];
    return ((r.data.result && r.data.result.list) || []).slice();
  } catch { return []; }
}

/** 拉视频分类榜，返回原始 data.list[] */
async function fetchVideo(rid) {
  const qs = new URLSearchParams({ rid: String(rid), type: "all" });
  try {
    const r = await getJson(`${VIDEO_RANK}?${qs}`, HEADERS);
    if (r.status !== 200 || !r.data || r.data.code !== 0) return [];
    return ((r.data.data && r.data.data.list) || []).slice();
  } catch { return []; }
}

/** 源自身热度：PGC/视频榜都用播放量 stat.view */
function heatOf(it) {
  return Number((it && it.stat && it.stat.view) || 0);
}

// 清洗后的可搜索标题：先去掉配音类后缀，再去括号 + 去"第X季"等
// 常见后缀：中文配音 / 中配 / 国语配音 / 普通话版 / 台配 / 大陆配音 / 配音版
const DUB_SUFFIX = /(中文配音|国语配音|普通话配音|国语版配音|普通话版|国语版|中配|台配|大陆配音|配音版)/g;
function cleanTitle(title) {
  const t = String(title || "").replace(DUB_SUFFIX, "");
  return cleanBrackets(cleanAnime(t)).replace(/\s{2,}/g, " ").trim();
}

/** TMDB 标题包含匹配（参考 douban.js matchOne），命中返回 buildInfo 完整字段，否则 null */
async function matchOne(rawTitle, apiKey, cfg) {
  const query = cleanTitle(rawTitle);
  if (!query) return null;
  const isMovie = cfg.mediaType === "movie";
  const results = await tmdb.search(query, { apiKey, isMovie });
  const target = query.toLowerCase();
  for (const res of results) {
    const n = (res.name || res.title || "").toLowerCase();
    const o = (res.original_name || res.original_title || "").toLowerCase();
    if (!(n.includes(target) || o.includes(target) || target.includes(n))) continue;
    if (!res.poster_path || !res.backdrop_path) continue;
    if (cfg.requireGenre && !(res.genre_ids || []).includes(cfg.requireGenre)) continue;
    return tmdb.buildInfo(res, { mediaType: cfg.mediaType });
  }
  return null;
}

/** 单条处理：rank=榜序，heat=源热度；匹配成功用 TMDB 完整字段，失败保留最小字段（均保留） */
async function buildEntry(raw, rank, apiKey, cfg) {
  const heat = heatOf(raw);
  const title = raw.title || "";
  let info = null;
  try { info = await matchOne(title, apiKey, cfg); } catch { info = null; }
  if (info) {
    info.rank = rank;       // 保留 B站榜序
    info.heat = heat;       // 保留源热度
    return info;
  }
  // 未匹配：保留源条目，popularity=heat 以便 widget 热度排序
  return { title, rank, heat, popularity: heat };
}

/** 主入口 */
async function fetch(apiKey) {
  const out = { last_updated: bjStamp() };
  for (const cfg of CATS) {
    const rawList = cfg.kind === "pgc"
      ? await fetchPgc(cfg.season_type)
      : await fetchVideo(cfg.rid);
    const arr = [];
    for (let i = 0; i < rawList.length; i++) {
      const raw = rawList[i];
      const rank = (raw && Number(raw.rank)) || i + 1; // PGC 自带 rank，视频榜用序号
      arr.push(await buildEntry(raw, rank, apiKey, cfg));
    }
    out[cfg.key] = arr;
  }
  return out;
}

module.exports = { name: "bili", title: "B站榜单", fetch, CATS };
