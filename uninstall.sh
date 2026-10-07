#!/usr/bin/env bash
# ============================================================
# 全站榜单 VPS · 一键卸载
# 用法：
#   bash <(curl -sL https://raw.githubusercontent.com/MakkaPakka518/VPS-Widget/refs/heads/main/uninstall.sh)
# 功能：停止服务 → 移除开机自启 → 移除防火墙端口 → 询问是否删除目录
# ============================================================

INSTALL_DIR="/opt/vps-widget"

echo "=============================================="
echo "  全站榜单 VPS · 一键卸载"
echo "=============================================="

# ---------- 1. 读取端口 ----------
PORT=""
if [ -f "$INSTALL_DIR/.port" ]; then
  PORT="$(cat "$INSTALL_DIR/.port" 2>/dev/null)"
fi

# ---------- 2. 停止服务 ----------
if command -v systemctl >/dev/null 2>&1; then
  systemctl stop vps-widget 2>/dev/null || true
  systemctl disable vps-widget 2>/dev/null || true
  rm -f /etc/systemd/system/vps-widget.service
  systemctl daemon-reload 2>/dev/null || true
  echo "[ok] systemd 服务已停止并移除"
fi
pkill -f "node server.js" 2>/dev/null || true
sleep 1
echo "[ok] 运行进程已停止"

# ---------- 3. 移除开机自启 (crontab @reboot) ----------
crontab -l 2>/dev/null | grep -v "vps-widget/server.js" | crontab - 2>/dev/null || true
echo "[ok] 开机自启项已移除"

# ---------- 4. 移除防火墙端口 ----------
if [ -n "$PORT" ]; then
  if command -v ufw >/dev/null 2>&1; then
    ufw delete allow "$PORT"/tcp >/dev/null 2>&1 || true
  fi
  if command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --remove-port="$PORT"/tcp >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1 || true
  fi
  echo "[ok] 防火墙规则已尝试移除（端口 $PORT）"
fi

# ---------- 5. 询问是否删除目录 ----------
read -p "是否删除代码和数据目录 $INSTALL_DIR ？(y/N): " ans
if [[ "$ans" =~ ^[Yy]$ ]]; then
  rm -rf "$INSTALL_DIR"
  echo "[ok] 已删除 $INSTALL_DIR"
else
  echo "[..] 保留 $INSTALL_DIR（如需重装可直接重新运行 install.sh）"
fi

echo "✅ 卸载完成"
