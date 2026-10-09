// lib/widget.js — 生成聚合 fw/rex 模块（9 源榜单）
const DOUBAN_CHANNELS = [
  { title: "全部劇集", value: "tv" }, { title: "大陸劇集", value: "tv_domestic" }, { title: "歐美劇集", value: "tv_american" },
  { title: "日本劇集", value: "tv_japanese" }, { title: "南韓劇集", value: "tv_korean" }, { title: "動漫番劇", value: "tv_animation" },
  { title: "紀錄片", value: "tv_documentary" }, { title: "大陸綜藝", value: "show_domestic" }, { title: "國外綜藝", value: "show_foreign" },
];
const THEATER_BRANDS = [
  { title: "迷霧劇場", value: "迷雾剧场" }, { title: "白夜劇場", value: "白夜剧场" }, { title: " X 劇場", value: "X剧场" },
  { title: "瑪卡的片單", value: "玛卡巴卡的悬疑剧" }, { title: "橫屏短劇", value: "横屏短剧" }, { title: "生花劇場", value: "生花剧场" },
  { title: "大家劇場", value: "大家剧场" }, { title: "小逗劇場", value: "小逗剧场" }, { title: "十分劇場", value: "十分剧场" },
  { title: "板凳單元", value: "板凳单元" }, { title: "螢火單元", value: "萤火单元" }, { title: "正午陽光", value: "正午阳光" },
  { title: "戀戀劇場", value: "恋恋剧场" }, { title: "懸疑劇場", value: "悬疑剧场" }, { title: "微塵劇場", value: "微尘剧场" },
];

function enumParam(name, title, value, options) {
  return `      { name: "${name}", title: "${title}", type: "enumeration", value: "${value}", enumOptions: [${options.map((o) => `{ title: "${o.title}", value: "${o.value}" }`).join(",")}] }`;
}
function pageParam() { return `      { name: "page", title: "页码", type: "page", startPage: 1 }`; }
const SORT_OPTIONS = [
  { title: "默認原序", value: "default" },
  { title: "最近更新", value: "latestUpdate" },
  { title: "最近發佈", value: "latestRelease" },
  { title: "熱度最高", value: "hottest" },
  { title: "流行趨勢", value: "trend" },
  { title: "高分優先", value: "highestRating" },
];
function sortParam() { return enumParam("sort", "排序方式", "default", SORT_OPTIONS); }

function generate(baseUrl) {
  const url = (baseUrl || "http://127.0.0.1:5555").replace(/\/+$/, "");
  return `/**
 * 全站榜单聚合 · 自动生成 (VPS 面板)
 * 数据源基础地址: ${url}
 * 包含：骨朵热度 / 豆瓣热榜 / 芒果TV / 剧场平台 / 番剧榜 / TMDB趋势 / B站榜单 / MAL热播 / AniList番剧
 */
WidgetMetadata = {
  id: "makka.vps.aggregator",
  title: "全站榜单聚合",
  description: "骨朵/豆瓣/芒果/剧场/番剧/TMDB/B站/MAL/AniList/Trakt 十大榜单（VPS 每日抓取）",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  site: "https://t.me/MakkaPakkaOvO",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  globalParams: [
    { name: "baseUrl", title: "VPS 数据地址", type: "input", placeholders: [{ title: "VPS 数据接口", value: "${url}" }] },
  ],
  modules: [
    {
      id: "loadGuduo",
      title: "骨朵热度",
      functionName: "loadGuduo",
      cacheDuration: 3600,
      params: [
${enumParam("category", "分类", "剧集", [{ title: "劇集", value: "剧集" }, { title: "綜藝", value: "综艺" }, { title: "動漫", value: "动漫" }, { title: "電影", value: "电影" }])},
${sortParam()},
${pageParam()},
      ],
    },
    {
      id: "loadDouban",
      title: "豆瓣熱榜",
      functionName: "loadDouban",
      cacheDuration: 3600,
      params: [
${enumParam("channel", "榜單分類", "tv", DOUBAN_CHANNELS)},
${sortParam()},
${pageParam()},
      ],
    },
    {
      id: "loadMangoTV",
      title: "芒果TV熱榜",
      functionName: "loadMangoTV",
      cacheDuration: 3600,
      params: [
${enumParam("sort_by", "類型", "tv", [{ title: "全部劇集", value: "tv" }, { title: "王牌綜藝", value: "show" }])},
${sortParam()},
${pageParam()},
      ],
    },
    {
      id: "loadTheater",
      title: "各平臺劇場",
      functionName: "loadTheater",
      cacheDuration: 3600,
      params: [
${enumParam("brand", "劇場品牌", "迷雾剧场", THEATER_BRANDS)},
${enumParam("status", "播出狀態", "all", [{ title: "全部", value: "all" }, { title: "已開播", value: "aired" }, { title: "即將推出", value: "upcoming" }])},
${sortParam()},
${pageParam()},
      ],
    },
    {
      id: "loadBangumi",
      title: "熱門番劇",
      functionName: "loadBangumi",
      cacheDuration: 3600,
      params: [
${sortParam()},
${pageParam()},
      ],
    },
    {
      id: "loadTmdb",
      title: "TMDB趨勢",
      functionName: "loadTmdb",
      cacheDuration: 3600,
      params: [
${enumParam("type", "榜單類型", "tv", [{ title: "電視劇趨勢", value: "tv" }, { title: "電影趨勢", value: "movie" }, { title: "熱門劇集", value: "tv_popular" }, { title: "熱門電影", value: "movie_popular" }])},
${sortParam()},
${pageParam()},
      ],
    },
    {
      id: "loadBili",
      title: "B站榜單",
      functionName: "loadBili",
      cacheDuration: 3600,
      params: [
${enumParam("cat", "榜單分類", "bangumi", [{ title: "番劇榜", value: "bangumi" }, { title: "國創榜", value: "guochuang" }, { title: "動畫榜", value: "anime" }, { title: "電視劇榜", value: "tv" }, { title: "電影榜", value: "movie" }, { title: "紀錄片榜", value: "doc" }])},
${sortParam()},
${pageParam()},
      ],
    },
    {
      id: "loadMAL",
      title: "MAL熱播番劇",
      functionName: "loadMAL",
      cacheDuration: 3600,
      params: [
${sortParam()},
${pageParam()},
      ],
    },
    {
      id: "loadAniList",
      title: "AniList番劇",
      functionName: "loadAniList",
      cacheDuration: 3600,
      params: [
${sortParam()},
${pageParam()},
      ],
    },
    {
      id: "loadTrakt",
      title: "Trakt榜單",
      functionName: "loadTrakt",
      cacheDuration: 3600,
      params: [
${enumParam("type", "榜單類型", "trending", [{ title: "劇集趨勢", value: "trending" }, { title: "劇集熱門", value: "popular" }, { title: "電影趨勢", value: "movie_trending" }, { title: "電影熱門", value: "movie_popular" }])},
${sortParam()},
${pageParam()},
      ],
    },
  ],
};

const BASE = "${url}";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const UA_HEADERS = { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" };

function toVideo(it) {
  // 舍弃没有 TMDB id 或海报的条目：Rex 无法解析为 TMDB（id=0、无海报）
  const tmdbId = Number(it.tmdbId || it.id) || 0;
  if (!tmdbId || !it.posterPath) return null;
  return {
    id: tmdbId,
    type: "tmdb",
    mediaType: it.mediaType || (it.type === "movie" ? "movie" : "tv"),
    title: it.title || it.tmdbTitle || "",
    posterPath: it.posterPath,
    backdropPath: it.backdropPath,
    rating: it.rating,
    releaseDate: it.releaseDate,
    description: it.description || it.overview || "",
  };
}

// 排序：默认原序 / 最近更新(lastUpdateDate) / 最近发布(releaseDate) / 热度(popularity) / 流行(popularity) / 高分(rating)
function sortItems(list, sort) {
  const s = sort || "default";
  const arr = (list || []).slice();
  if (s === "default") return arr;
  const key = s === "latestUpdate" ? "lastUpdateDate"
    : s === "latestRelease" ? "releaseDate"
    : (s === "hottest" || s === "trend") ? "popularity" : "rating";
  if (key === "lastUpdateDate" || key === "releaseDate") {
    arr.sort((a, b) => String(b[key] || "").localeCompare(String(a[key] || "")));
  } else {
    arr.sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));
  }
  return arr;
}

function paginate(list, page, size = 24) {
  const p = Number(page || 1);
  const start = (p - 1) * size;
  // 先整体过滤（舍弃无 TMDB id/海报的条目），再对有效条目分页
  const valid = (list || []).map(toVideo).filter(Boolean);
  return valid.slice(start, start + size);
}

async function loadGuduo(params = {}) {
  const res = await Widget.http.get((params.baseUrl || BASE) + "/data/guduo.json", { headers: UA_HEADERS });
  const list = (res.data && res.data.categories && res.data.categories[params.category || "剧集"]) || [];
  return paginate(sortItems(list, params.sort), params.page);
}

async function loadDouban(params = {}) {
  const res = await Widget.http.get((params.baseUrl || BASE) + "/data/douban.json", { headers: UA_HEADERS });
  const list = (res.data && res.data[params.channel || "tv"]) || [];
  return paginate(sortItems(list, params.sort), params.page);
}

async function loadMangoTV(params = {}) {
  const res = await Widget.http.get((params.baseUrl || BASE) + "/data/mgtv.json", { headers: UA_HEADERS });
  const list = (res.data && res.data[params.sort_by || "tv"]) || [];
  return paginate(sortItems(list, params.sort), params.page);
}

async function loadTheater(params = {}) {
  const res = await Widget.http.get((params.baseUrl || BASE) + "/data/theater.json", { headers: UA_HEADERS });
  const brand = (res.data || {})[params.brand || "迷雾剧场"];
  if (!brand) return [];
  let list = [];
  if (params.status === "aired") list = brand.aired || [];
  else if (params.status === "upcoming") list = brand.upcoming || [];
  else list = [...(brand.upcoming || []), ...(brand.aired || [])];
  return paginate(sortItems(list, params.sort), params.page);
}

async function loadBangumi(params = {}) {
  const res = await Widget.http.get((params.baseUrl || BASE) + "/data/bangumi.json", { headers: UA_HEADERS });
  const list = (res.data && res.data.hot_anime) || [];
  return paginate(sortItems(list, params.sort), params.page);
}

async function loadTmdb(params = {}) {
  const res = await Widget.http.get((params.baseUrl || BASE) + "/data/tmdb.json", { headers: UA_HEADERS });
  const list = (res.data && res.data[params.type || "tv"]) || [];
  return paginate(sortItems(list, params.sort), params.page);
}

async function loadBili(params = {}) {
  const res = await Widget.http.get((params.baseUrl || BASE) + "/data/bili.json", { headers: UA_HEADERS });
  const list = (res.data && res.data[params.cat || "bangumi"]) || [];
  return paginate(sortItems(list, params.sort), params.page);
}

async function loadMAL(params = {}) {
  const res = await Widget.http.get((params.baseUrl || BASE) + "/data/mal.json", { headers: UA_HEADERS });
  const list = (res.data && res.data.airing) || [];
  return paginate(sortItems(list, params.sort), params.page);
}

async function loadAniList(params = {}) {
  const res = await Widget.http.get((params.baseUrl || BASE) + "/data/anilist.json", { headers: UA_HEADERS });
  const list = (res.data && res.data.trending) || [];
  return paginate(sortItems(list, params.sort), params.page);
}

async function loadTrakt(params = {}) {
  const res = await Widget.http.get((params.baseUrl || BASE) + "/data/trakt.json", { headers: UA_HEADERS });
  const list = (res.data && res.data[params.type || "trending"]) || [];
  return paginate(sortItems(list, params.sort), params.page);
}
`;
}

module.exports = { generate };
