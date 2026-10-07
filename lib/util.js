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

// 北京时间
function bjNow() { return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" })); }
function bjYesterday() {
  const d = bjNow(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function todayString() { return new Date().toISOString().slice(0, 10); }
function bjStamp() {
  const d = bjNow();
  return d.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) + " " +
         d.toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
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
