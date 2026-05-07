#!/bin/bash
set -e

# Smart Locker - First Time VPS Setup
# Prereq on VPS: Node.js 20+, npm, PM2, MongoDB available.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_ENV="$SCRIPT_DIR/.env.deploy"

if [ ! -f "$DEPLOY_ENV" ]; then
  echo "ERROR: Missing $DEPLOY_ENV"
  echo "Copy .env.deploy.example to .env.deploy and fill values."
  exit 1
fi

set -a
source "$DEPLOY_ENV"
set +a

VPS_IP="${DEPLOY_VPS_IP:-}"
VPS_USER="${DEPLOY_VPS_USER:-root}"
VPS_PASS="${DEPLOY_VPS_PASS:-}"
VPS_DIR="${DEPLOY_VPS_DIR:-/root/projects/smart_locker}"
PM2_APP="${DEPLOY_PM2_APP_NAME:-smart-locker-api}"
TAR_FILE="/tmp/smart-locker-vps-api.tar.gz"

if [ -z "$VPS_IP" ] || [ -z "$VPS_PASS" ]; then
  echo "ERROR: DEPLOY_VPS_IP and DEPLOY_VPS_PASS are required in .env.deploy"
  exit 1
fi

if ! command -v pscp >/dev/null 2>&1 || ! command -v plink >/dev/null 2>&1; then
  echo "ERROR: pscp/plink not found. Install PuTTY and add it to PATH."
  exit 1
fi

echo "======================================================"
echo " Smart Locker - First Time VPS Setup"
echo " VPS: $VPS_USER@$VPS_IP:$VPS_DIR"
echo "======================================================"

echo "[1/5] Creating backend archive..."
cd "$PROJECT_ROOT"
tar \
  --exclude='VPS/api/node_modules' \
  --exclude='VPS/api/dist' \
  --exclude='VPS/api/.env' \
  -czf "$TAR_FILE" VPS/api VPS/deploy/ecosystem.config.cjs

echo "[2/5] Uploading archive..."
pscp -pw "$VPS_PASS" "$TAR_FILE" "$VPS_USER@$VPS_IP:$VPS_DIR/smart-locker-vps-api.tar.gz"

echo "[3/5] Extracting and installing on VPS..."
plink -ssh "$VPS_USER@$VPS_IP" -pw "$VPS_PASS" -batch "
set -e
mkdir -p $VPS_DIR
cd $VPS_DIR
tar -xzf smart-locker-vps-api.tar.gz
rm -f smart-locker-vps-api.tar.gz
cd $VPS_DIR/VPS/api
npm install
npm run build
"

echo "[4/5] Starting PM2..."
plink -ssh "$VPS_USER@$VPS_IP" -pw "$VPS_PASS" -batch "
set -e
pm2 delete '$PM2_APP' 2>/dev/null || true
pm2 start $VPS_DIR/VPS/deploy/ecosystem.config.cjs --env production
pm2 save
pm2 list
"

echo "[5/5] Reminder..."
echo "  Ensure production env file exists on VPS:"
echo "  $VPS_DIR/VPS/api/.env"
echo "  Never upload secrets to git."

rm -f "$TAR_FILE"

echo "Setup done."
