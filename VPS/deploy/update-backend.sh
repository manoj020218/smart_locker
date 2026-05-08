#!/bin/bash
set -e

# Smart Locker - Backend Update Script
# Uploads VPS/api and deploy config to VPS, then rebuilds and restarts PM2.
# Uses pnpm on VPS (bootstrapped via corepack when available).
# Run from project root or anywhere: bash VPS/deploy/update-backend.sh

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
echo " Smart Locker - Backend Update"
echo " VPS: $VPS_USER@$VPS_IP:$VPS_DIR"
echo "======================================================"

echo "[1/4] Creating backend archive..."
cd "$PROJECT_ROOT"
tar \
  --exclude='VPS/api/node_modules' \
  --exclude='VPS/api/dist' \
  --exclude='VPS/api/.env' \
  -czf "$TAR_FILE" VPS/api VPS/deploy/ecosystem.config.cjs
echo "  Archive created: $TAR_FILE"

echo "[2/4] Uploading archive to VPS..."
pscp -pw "$VPS_PASS" "$TAR_FILE" "$VPS_USER@$VPS_IP:$VPS_DIR/smart-locker-vps-api.tar.gz"

echo "[3/4] Extracting + installing + building on VPS (pnpm)..."
plink -ssh "$VPS_USER@$VPS_IP" -pw "$VPS_PASS" -batch "
set -e
mkdir -p $VPS_DIR
cd $VPS_DIR
tar -xzf smart-locker-vps-api.tar.gz
rm -f smart-locker-vps-api.tar.gz
cd $VPS_DIR/VPS/api
if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@latest --activate
  else
    npm install -g pnpm
  fi
fi
pnpm install --prod=false
pnpm run build
"

echo "[4/4] Restarting PM2..."
plink -ssh "$VPS_USER@$VPS_IP" -pw "$VPS_PASS" -batch "
set -e
if pm2 list | grep -q '$PM2_APP'; then
  pm2 restart '$PM2_APP' --update-env
else
  pm2 start $VPS_DIR/VPS/deploy/ecosystem.config.cjs --env production
  pm2 save
fi
pm2 list
"

rm -f "$TAR_FILE"

echo "Done. Backend deployed and PM2 process updated."
