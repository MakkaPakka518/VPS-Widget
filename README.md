# 全站榜单 · VPS 版

把之前的 GitHub Actions 榜单抓取，做成一个**常驻 VPS 服务**：每天定时抓取 **5 个榜单源**
（骨朵 / 豆瓣 / 芒果TV / 剧场平台 / 番剧），带**网页管理面板**（填 TMDB API Key、预览各源数据），
并**自动生成聚合 fw/rex 模块 widget.js**。

## 抓取的 5 个源
| 源 | 内容 | 数据接口 |
|---|---|---|
| 骨朵热度 `guduo` | 剧集 / 综艺 / 动漫 / 电影 4 分类 | `/data/guduo.json` |
| 豆瓣热榜 `douban` | 9 个区域（大陆/欧美/日/韩/动漫/纪录/综艺…） | `/data/douban.json` |
| 芒果TV `mgtv` | 剧集 + 王牌综艺 | `/data/mgtv.json` |
| 剧场平台 `theater` | 15 个剧场（迷雾/白夜/X/恋恋…） | `/data/theater.json` |
| 番剧 `bangumi` | bgm.tv 排名榜（公开 sort=rank，无需登录） | `/data/bangumi.json` |

每个源都由对应 `lib/<源>.js` 抓取 + TMDB 匹配，结果结构与原 List 仓库 JSON 保持一致。

## 特性
- **端口 5555**（可用 `PORT` 改）
- **面板登录密码**：部署时询问（回车自动随机生成），部署完成显示；面板内可随时改密码
- **每日定时抓取**：默认每天 17:00（北京时间）串行抓 5 源，存到 `data/`
- **网页管理面板**：`http://<VPS>:5555/` —— 登录后填 TMDB Key、看各源状态、选源预览、手动更新、改密码
- **自动生成 widget.js**：一个聚合 fw/rex 模块，含 5 个榜单子模块，每模块带**排序方式**（默认原序/最近更新/最近发布/热度最高/流行趋势/高分优先），数据源指向本机
- **零依赖**：只用 Node.js 内置模块，无需 npm install
- **一键部署/卸载**：GitHub 远程 `curl` 执行 `install.sh` / `uninstall.sh`

> 说明：`/data/*.json` 与 `/widget.js` 对外公开（widget 需加载数据）；管理 API 与面板需登录。

## 部署（GitHub 远程一键）
代码已托管在 `MakkaPakka518/VPS-Widget` 仓库（main 分支）。在 VPS 上执行：

```bash
# 一键部署：询问端口（回车默认 5555），自动拉代码 + 常驻 + 开机自启 + 放行端口
bash <(curl -sL https://raw.githubusercontent.com/MakkaPakka518/VPS-Widget/refs/heads/main/install.sh)
```

```bash
# 一键卸载：停止服务 + 移除自启/防火墙 + 询问是否删除目录
bash <(curl -sL https://raw.githubusercontent.com/MakkaPakka518/VPS-Widget/refs/heads/main/uninstall.sh)
```

> 需要 Node.js 18+ 与 git；没有会提示安装命令。

## 部署（本地上传，备选）
```bash
# 1) 把 vps-bangumi/ 整个目录上传到 VPS（如 /opt/bangumi）
# 2) 一键部署（自动：环境检查 → 常驻 → 开机自启 → 放行 5555 → 验证）
cd /opt/bangumi && bash deploy.sh
```
> deploy.sh 有 systemd 时用 systemd 常驻并自启，否则用 nohup + crontab @reboot。

## 使用流程
1. 浏览器打开 `http://<VPS>:5555/`
2. 「配置」里填 **TMDB API Key** 和 **VPS 对外地址** → 保存
3. 点「更新全部」或各源「更新」抓取（抓一次需数分钟，串行做 TMDB 匹配）
4. 「数据预览」选源查看抓到的片单
5. 「Widget 模块」复制模块地址，在 Forward 里添加即可

## 手动启动
```bash
node server.js            # 前台
nohup node server.js > server.log 2>&1 &   # 后台
./start.sh
```
端口：`PORT=8888 node server.js`

## HTTP 接口
| 方法 / 路径 | 说明 |
|---|---|
| `GET /` | 管理面板 |
| `GET /data/<源>.json` | 各源数据（CORS 已开） |
| `GET /widget.js` | 生成的聚合模块 |
| `GET /api/sources` | 各源状态 |
| `GET/POST /api/config` | 读/写配置 |
| `POST /api/update` | 更新全部（带 `{source:xxx}` 单源） |
| `GET /api/preview?source=xxx` | 预览 |
| `GET /api/widget` | widget 地址+代码 |

## 配置
`config.json` 自动生成：`tmdbApiKey`、`vpsAddress`、`updateHour`、`updateEnabled`。

## 生成模块
聚合模块 `id: makka.vps.aggregator`，5 个子模块：`loadGuduo` / `loadDouban` / `loadMangoTV` /
`loadTheater` / `loadBangumi`。条目为 `VideoItem`（`type:"tmdb"` + 数字 `tmdbId` + `mediaType`），
点击走 Forward 内置 TMDB 详情页。数据源默认你填的 VPS 地址，也可在模块 `globalParams.baseUrl` 改。

## 防火墙
一键部署已尝试放行 5555；若面板打不开，检查云厂商安全组放行 `5555/TCP`：
```bash
sudo ufw allow 5555/tcp
```

## 备注
- 本机开发环境连不上各榜单域名，**解析逻辑已离线单测**，但真实抓取需在 VPS 上点一次「更新」验证。
- 抓取量：番剧默认 40 部、其余源照原脚本上限；VPS 无 Cloudflare 的请求数硬限制，可自行调整各源 `lib/*.js` 的 `limit`/`MAX_ITEMS`。
- 豆瓣/芒果/剧场可能对海外 IP 或风控敏感，失败时面板会显示错误信息，可检查对应源。
