#!/usr/bin/env bash
# ============================================================
# 企业知识库 · Ubuntu 22.04 服务器一键部署脚本
# 目标形态：
#   - uvicorn 常驻监听 127.0.0.1:1111（systemd 管理）
#   - nginx 监听 80，http://<服务器IP>/rag/ 反代到后端
#   - 数据库使用 Zilliz Cloud（免 Docker），.env 需提前配置
# 用法：
#   scp -r enterprise-knowledge root@<IP>:~/
#   ssh root@<IP> "cd ~/enterprise-knowledge && bash scripts/deploy_server.sh"
# 前置：
#   - .env 已配置 ZHIPU_API_KEY / MILVUS_ADDRESS / MILVUS_TOKEN（可用本地 .env 直接上传）
# ============================================================
set -euo pipefail

APP_NAME="enterprise-knowledge"
APP_DIR="/opt/${APP_NAME}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> 0. 检查 root 权限"
[ "$(id -u)" -eq 0 ] || { echo "请用 root 运行：sudo bash scripts/deploy_server.sh"; exit 1; }

echo "==> 1. 安装 uv（Python 3.12 依赖管理）"
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
uv --version

echo "==> 2. 安装 nginx"
apt-get update -qq
apt-get install -y -qq nginx >/dev/null

echo "==> 3. 部署项目到 ${APP_DIR}"
mkdir -p "${APP_DIR}"
rsync -a --delete \
  --exclude '.venv' --exclude '.uv-cache' --exclude 'storage' --exclude 'volumes' \
  --exclude '.test-tmp' --exclude '.git' \
  "${SRC_DIR}/" "${APP_DIR}/" 2>/dev/null || cp -a "${SRC_DIR}/." "${APP_DIR}/"

echo "==> 4. 安装依赖（uv 自动下载 CPython 3.12）"
cd "${APP_DIR}"
uv sync

echo "==> 5. 环境检查（Zilliz 连接 + 智谱 Key）"
uv run python scripts/doctor.py || { echo "doctor.py 未通过，请检查 .env 后重试"; exit 1; }

echo "==> 6. 导入样例文档（幂等，云端已建集合则全部 skipped）"
uv run python scripts/seed.py || true

echo "==> 7. 安装 systemd 服务"
UV_BIN="$(command -v uv)"
sed "s|/root/.local/bin/uv|${UV_BIN}|" deploy/enterprise-knowledge.service \
  > /etc/systemd/system/${APP_NAME}.service
systemctl daemon-reload
systemctl enable --now ${APP_NAME}
sleep 3
systemctl --no-pager --lines=15 status ${APP_NAME} || true

echo "==> 8. 安装 nginx 反代（/rag/ → 127.0.0.1:1111）"
cp deploy/nginx-rag.conf /etc/nginx/conf.d/rag.conf
nginx -t && systemctl reload nginx

echo ""
echo "============================================================"
echo " 部署完成！"
echo " 访问地址： http://<服务器IP>/rag/"
echo " 后端端口： 127.0.0.1:1111（仅本机，不对外）"
echo " 日志查看： journalctl -u ${APP_NAME} -f"
echo " 重启服务： systemctl restart ${APP_NAME}"
echo " 注意：请在腾讯云控制台安全组放行 TCP 80 入站"
echo "============================================================"
