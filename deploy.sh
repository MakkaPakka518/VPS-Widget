#!/usr/bin/env bash
# ============================================================
# Bangumi VPS · 一键部署脚本
# 把 vps-bangumi/ 目录上传到 VPS 后，运行：
#     bash deploy.sh
# 脚本自动完成：环境检查 → 常驻启动 → 开机自启 → 放行防火墙 → 验证
# ============================================================
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-5555}"

echo "==> Bangumi VPS 一键部署 (端口 $PORT)"

# ---------- 1. 检查 Node.js ----------
if ! command -v node >/dev/null 2>&1; then
  echo "[!] 未安装 Node.js，请先执行："
  echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi
NODE_V="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_V" -lt 18 ]; then
  echo "[!] 需要 Node.js 18+，当前 $(node -v)"
  exit 1
fi
echo "[ok] Node.js $(node -v)"

# 清理可能残留的配置/数据（首次部署无需）
rm -f "$DIR/config.json" "$DIR/data.json" 2>/dev/null || true

# ---------- 2. 选择常驻方式 ----------
INSTALL_MODE=""
if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
  INSTALL_MODE=systemd
else
  INSTALL_MODE=nohup
fi
echo "[ok] 使用 $INSTALL_MODE 模式常驻"

# ---------- 3. 安装并启动 ----------
if [ "$INSTALL_MODE" = "systemd" ]; then
  cat > /etc/systemd/system/bangumi.service <<EOF
[Unit]
Description=Bangumi VPS
After=network.target

[Service]
WorkingDirectory=$DIR
ExecStart=$(command -v node) server.js
Environment=PORT=$PORT
Restart=always

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable bangumi >/dev/null 2>&1 || true
  systemctl restart bangumi
  echo "[ok] systemd 服务已启动并设开机自启"
else
  # 停掉旧的同名服务（如之前有）
  pkill -f "node server.js" 2>/dev/null || true
  sleep 1
  cd "$DIR"
  nohup env PORT="$PORT" node server.js > server.log 2>&1 &
  echo $! > server.pid
  echo "[ok] nohup 后台启动，PID=$(cat server.pid)"
  # 开机自启：写入 crontab @reboot（去重）
  if ! (crontab -l 2>/dev/null | grep -q "bangumi/server.js"); then
    (crontab -l 2>/dev/null; echo "@reboot cd $DIR && env PORT=$PORT node server.js >> $DIR/server.log 2>&1") | crontab -
    echo "[ok] 已加入 crontab @reboot 开机自启"
  fi
fi

# ---------- 4. 放行防火墙 ----------
if command -v ufw >/dev/null 2>&1; then
  ufw allow "$PORT"/tcp >/dev/null 2>&1 && echo "[ok] ufw 已放行 $PORT/tcp" || echo "[!] ufw 放行失败，请手动执行：sudo ufw allow $PORT/tcp"
elif command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT"/tcp >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1 && echo "[ok] firewalld 已放行 $PORT/tcp" || echo "[!] firewalld 放行失败，请手动放行 $PORT/tcp"
fi

# ---------- 5. 等待并验证 ----------
sleep 2
if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo ""
  echo "=============================================="
  echo " ✅ 部署完成！"
  echo "    面板： http://<你的VPS_IP>:$PORT/"
  echo "    数据： http://<你的VPS_IP>:$PORT/data/bangumi.json"
  echo "    模块： http://<你的VPS_IP>:$PORT/widget.js"
  echo "    用浏览器打开面板，填入 TMDB API Key 即可开始抓取。"
  echo "=============================================="
else
  echo "[!] 服务似乎未正常启动，请检查日志： $DIR/server.log"
  exit 1
fi
