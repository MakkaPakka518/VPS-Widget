// lib/util.js — 通用工具：清洗/HTML 解析/时间/存取
const fs = require("fs");

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}
function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// 各源标题清洗（照搬原 Python 逻辑）
function cleanSeason(t) {
  return String(t || "")
    .replace(/第[一二三四五六七八九十百\d]+[季期部章]/g, "")
    .replace(/Season\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
function cleanBrackets(t) {
  return String(t || "").replace(/\(.*?\)|（.*?）|\[.*?\]|【.*?】/g, "").replace(/\s+/g, " ").trim();
}
// 骨朵：去季/期/部 + 括号 + 尾部数字
function cleanGuduo(t) {
  return cleanBrackets(cleanSeason(t))
    .replace(/年番/g, "").replace(/特别篇/g, "")
    .replace(/\s*\d+$/, "")
    .replace(/\s+/g, " ").trim();
}
// 豆瓣/剧场：去季 + 去尾部年份 (2024)
function cleanDouban(t) {
  return String(t || "")
    .replace(/[（(]\s*(\d{4})\s*[)）]$/, "")
    .replace(/第[一二三四五六七八九十百\d]+季/g, "")
    .replace(/Season\s*\d+/gi, "")
    .replace(/\s+/g, " ").trim();
}
// 芒果：去季/期/部/章 + 括号
function cleanMgtv(t) {
  return cleanBrackets(cleanSeason(t));
}
// 番剧：去季/期/部/章 + 尾部年份
function cleanAnime(t) {
  return String(t || "")
    .replace(/第[一二三四五六七八九十百\d]+[季期部章]/g, "")
    .replace(/Season\s*\d+/gi, "")
    .replace(/ \d{4}$/, "")
    .replace(/\s+/g, " ").trim();
}

// 北京时间（统一用 Intl 显式 Asia/Shanghai，避免双重时区转换错误）
function bjParts(d) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const g = (t) => ((parts.find((p) => p.type === t) || {}).value || "");
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour"), mi: g("minute"), s: g("second") };
}
function bjNow() {
  const p = bjParts(new Date());
  return new Date(`${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}:${p.s}+08:00`);
}
function bjYesterday() {
  const d = bjNow(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function todayString() {
  const p = bjParts(new Date());
  return `${p.y}-${p.mo}-${p.d}`;
}
function bjStamp() {
  const p = bjParts(new Date());
  return `${p.y}/${p.mo}/${p.d} ${p.h}:${p.mi}:${p.s}`;
}

// JSON 存取
function loadJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }
function saveJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }

// TMDB 图片原始路径是否完整
function isComplete(res) {
  return !!(res.poster_path && res.backdrop_path);
}

module.exports = {
  decodeEntities, stripTags,
  cleanSeason, cleanBrackets, cleanGuduo, cleanDouban, cleanMgtv, cleanAnime,
  bjNow, bjYesterday, todayString, bjStamp,
  loadJson, saveJson, isComplete,
};
