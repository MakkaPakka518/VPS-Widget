#!/usr/bin/env bash
# ============================================================
# 全站榜单 VPS · 远程一键部署
# 用法：
#   bash <(curl -sL https://raw.githubusercontent.com/MakkaPakka518/VPS-Widget/refs/heads/main/install.sh)
# 功能：询问端口（回车默认 5555）→ 从仓库拉取代码 → 常驻 + 开机自启 → 放行端口 → 验证
# ============================================================
set -e

REPO_URL="https://github.com/MakkaPakka518/VPS-Widget.git"
BRANCH="main"
INSTALL_DIR="/opt/vps-widget"

echo "=============================================="
echo "  全站榜单 VPS · 一键部署"
echo "=============================================="

# ---------- 1. 询问端口 ----------
read -p "请输入服务端口（直接回车默认 5555）：" PORT_IN
PORT="${PORT_IN:-5555}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "[!] 端口无效：$PORT"
  exit 1
fi
echo "[ok] 使用端口：$PORT"

# ---------- 1.5 询问面板密码 ----------
read -p "请设置面板登录密码（直接回车自动随机生成）：" PW_IN
if [ -z "$PW_IN" ]; then
  PW="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 10)"
  echo "[ok] 已随机生成密码：$PW"
else
  PW="$PW_IN"
  echo "[ok] 已使用自定义密码"
fi

# ---------- 2. 环境检查 ----------
if ! command -v git >/dev/null 2>&1; then
  echo "[!] 未安装 git，请先：sudo apt install -y git"
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "[!] 未安装 Node.js，请先：curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi
NODE_V="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_V" -lt 18 ]; then
  echo "[!] 需要 Node.js 18+，当前 $(node -v)"
  exit 1
fi
echo "[ok] git ✓  Node.js $(node -v)"

# ---------- 3. 拉取 / 更新代码 ----------
echo "[..] 拉取代码到 $INSTALL_DIR ..."
if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH" 2>/dev/null || git -C "$INSTALL_DIR" pull --rebase 2>/dev/null || true
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH" 2>/dev/null || true
else
  git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# 持久化端口（卸载时读取）
echo "$PORT" > .port

# 持久化面板密码：写明文给服务端首次启动读取，同时更新 config.json 哈希（重装也生效）
echo "$PW" > .adminpass
PW_HASH="$(node -e "process.stdout.write(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "$PW")"
if [ -f config.json ]; then
  node -e "const fs=require('fs');const f='config.json';let c={};try{c=JSON.parse(fs.readFileSync(f,'utf8'))}catch{};c.password=process.argv[1];fs.writeFileSync(f,JSON.stringify(c,null,2));" "$PW_HASH"
fi

# ---------- 4. 常驻启动 ----------
if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
  cat > /etc/systemd/system/vps-widget.service <<EOF
[Unit]
Description=Fullsite VPS Widget
After=network.target

[Service]
WorkingDirectory=$INSTALL_DIR
ExecStart=$(command -v node) server.js
Environment=PORT=$PORT
Restart=always

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable vps-widget >/dev/null 2>&1 || true
  systemctl restart vps-widget
  echo "[ok] systemd 服务已启动并设开机自启"
else
  pkill -f "node server.js" 2>/dev/null || true
  sleep 1
  nohup env PORT="$PORT" node server.js > server.log 2>&1 &
  echo $! > server.pid
  echo "[ok] nohup 后台启动 PID=$(cat server.pid)"
  if ! (crontab -l 2>/dev/null | grep -q "vps-widget/server.js"); then
    (crontab -l 2>/dev/null; echo "@reboot cd $INSTALL_DIR && env PORT=$PORT node server.js >> $INSTALL_DIR/server.log 2>&1") | crontab -
    echo "[ok] 已加 crontab @reboot 开机自启"
  fi
fi

# ---------- 5. 放行端口 ----------
if command -v ufw >/dev/null 2>&1; then
  ufw allow "$PORT"/tcp >/dev/null 2>&1 && echo "[ok] ufw 已放行 $PORT/tcp" || echo "[!] ufw 放行失败，请手动：sudo ufw allow $PORT/tcp"
elif command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT"/tcp >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1 && echo "[ok] firewalld 已放行 $PORT/tcp"
fi

# ---------- 6. 验证 ----------
sleep 2
if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo ""
  echo "=============================================="
  echo " ✅ 部署完成！端口 $PORT"
  echo "    登录地址： http://<你的VPS_IP>:$PORT/"
  echo "    登录密码： $PW"
  echo "    模块： http://<你的VPS_IP>:$PORT/widget.js"
  echo "    用浏览器打开面板，用上面密码登录，填 TMDB API Key 后点『更新全部』。"
  echo "    面板内可随时修改密码。"
  echo "    卸载： curl .../uninstall.sh"
  echo "=============================================="
else
  echo "[!] 服务未正常启动，请查看日志： $INSTALL_DIR/server.log"
  exit 1
fi
