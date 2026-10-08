# 全站榜单 · Vercel 版

基于同一套 10 源榜单抓取逻辑的 **Vercel（serverless）版**，把数据抓取、管理面板、widget 模块搬到 Vercel 上，无需自己的 VPS。

> 与 VPS 版的差异：Vercel 是无状态 serverless，数据与配置存在 **Vercel KV（Upstash Redis）**；免费档函数超时约 10 秒，因此采用「**定时分片**」——cron 每次只更新一个源并轮转，保证所有源都能刷新且不超时。

## 特性
- **10 个榜单源**：骨朵 / 豆瓣 / 芒果TV / 剧场 / 番剧 / TMDB / B站(番剧+国创) / MAL / AniList / Trakt
- **网页管理面板**：登录密码、填 TMDB API Key 与 Trakt Token、预览各源、手动更新、改密码
- **自动生成 widget.js**：聚合 fw/rex 模块，含 10 个子模块 + 排序方式
- **自动定时更新**：cron 每 15 分钟触发一次，逐源轮转，全部 10 源约每 2.5 小时刷新一轮
- **零依赖**：只用 Node 内置模块 + Upstash REST，无需 npm install
- **数量上限**：每源最多存前 50 条（适配免费档超时）

## 部署步骤（3 分钟）

### 1. 建 Vercel KV
Vercel 项目页 → **Storage** → **Create Database** → 选 **KV (Upstash Redis)** → 取名后 **Connect to Project**（选你这个项目）。
连接后 Vercel 会自动注入 `KV_REST_API_URL` 与 `KV_REST_API_TOKEN` 环境变量，无需手动填。

### 2. 设置初始登录密码
项目 **Settings → Environment Variables**，加一个：
```
ADMIN_PASSWORD  你的初始面板密码
```
（不设则默认 `admin`，建议面板内再改。配置与密码只存 KV，不进仓库。）

### 3. 部署
- 方式 A（推荐）：把本目录推到 GitHub 的独立分支（如 `vercel`），在 Vercel 里 **Add New Project → Import** 该仓库该分支，Framework 选 **Other**，点 Deploy。
- 方式 B（CLI）：本目录执行
  ```bash
  npm i -g vercel
  vercel --prod
  ```
  首次会引导登录并关联项目（注意：Vercel 命令需要项目已建或会新建）。

部署完成后访问 `https://<your-project>.vercel.app/`，用 `ADMIN_PASSWORD` 登录。

## 使用
1. 面板「配置」里填 **TMDB API Key**、**Trakt Token**（可选）、可留空 VPS 地址（会自动用当前域名）→ 保存
2. 点「更新全部」逐源抓取，或等 cron 每 15 分钟自动轮转
3. 「Widget 模块」复制模块地址，在 Forward 里添加
4. 数据接口：`/data/{guduo,douban,mgtv,theater,bangumi,tmdb,bili,mal,anilist,trakt}.json`（公开，CORS 已开）

## 定时说明
`vercel.json` 里 cron：
```json
"crons": [{ "path": "/api/cron", "schedule": "*/15 * * * *" }]
```
- 每次 `/api/cron` 只更新**一个**源并轮转，避免免费档 10 秒超时
- 若你的 Vercel 套餐对 cron 频率有限制，可把 schedule 改为 `0 * * * *`（每小时），则每源约 10 小时刷一轮
- cron 需要配置了 TMDB API Key 才会真正抓取

## 文件结构
```
vercel.json         路由 + cron
api/index.js        面板 + /api/* 管理（登录鉴权，KV 持久化）
api/data.js         /data/<src>.json（公开）
api/widget.js       /widget.js（公开）
api/cron.js         定时分片更新
lib/kv.js           Upstash KV REST 封装（用 KV_REST_API_URL/TOKEN）
lib/store.js        配置与会话 KV 持久化
lib/registry.js     10 源注册 + 计数
lib/updater.js      单源抓取 + 截断50条 + 轮转游标
lib/{各源}.js       10 个源模块（与 VPS 版共用）
lib/widget.js       聚合模块生成器
lib/panel.js        面板 HTML（内联）
public/index.html   面板源码（供参考/修改后重新内联）
test-local.js       本地 mock 验证（内存 KV）
```

## 本地验证
```bash
node test-local.js   # 用内存 Upstash mock 跑通登录/配置/数据/widget/cron轮转 16 项
```
