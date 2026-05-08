#!/bin/bash
set -e

# Smart Locker - Static Website Deploy
# Uploads website pages to VPS site directory.

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
SITE_DIR="${DEPLOY_SITE_DIR:-/root/projects/smart_locker/site}"

if [ -z "$VPS_IP" ] || [ -z "$VPS_PASS" ]; then
  echo "ERROR: DEPLOY_VPS_IP and DEPLOY_VPS_PASS are required in .env.deploy"
  exit 1
fi

if ! command -v pscp >/dev/null 2>&1 || ! command -v plink >/dev/null 2>&1; then
  echo "ERROR: pscp/plink not found. Install PuTTY and add it to PATH."
  exit 1
fi

TAR_FILE="/tmp/smart-locker-site.tar.gz"

echo "======================================================"
echo " Smart Locker - Website Deploy"
echo " VPS: $VPS_USER@$VPS_IP"
echo " SITE_DIR: $SITE_DIR"
echo "======================================================"

echo "[1/3] Creating website archive..."
cd "$PROJECT_ROOT"
tar -czf "$TAR_FILE" \
  index.html \
  about.html \
  privacy-policy.html \
  terms-and-conditions.html \
  account-deletion.html \
  app-support.html

echo "[2/3] Uploading archive to VPS..."
pscp -pw "$VPS_PASS" "$TAR_FILE" "$VPS_USER@$VPS_IP:$VPS_DIR/smart-locker-site.tar.gz"

echo "[3/3] Extracting into site directory..."
plink -ssh "$VPS_USER@$VPS_IP" -pw "$VPS_PASS" -batch "
set -e
mkdir -p '$SITE_DIR'
cd '$SITE_DIR'
tar -xzf '$VPS_DIR/smart-locker-site.tar.gz'
rm -f '$VPS_DIR/smart-locker-site.tar.gz'
"

rm -f "$TAR_FILE"
echo "Website deploy complete."
