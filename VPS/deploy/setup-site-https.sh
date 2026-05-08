#!/bin/bash
set -e

# Smart Locker - Nginx + HTTPS Setup
# Creates nginx site config and issues SSL via certbot.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_ENV="$SCRIPT_DIR/.env.deploy"
TEMPLATE_FILE="$SCRIPT_DIR/nginx-smartlocker.conf.template"

if [ ! -f "$DEPLOY_ENV" ]; then
  echo "ERROR: Missing $DEPLOY_ENV"
  echo "Copy .env.deploy.example to .env.deploy and fill values."
  exit 1
fi

if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "ERROR: Missing template: $TEMPLATE_FILE"
  exit 1
fi

set -a
source "$DEPLOY_ENV"
set +a

VPS_IP="${DEPLOY_VPS_IP:-}"
VPS_USER="${DEPLOY_VPS_USER:-root}"
VPS_PASS="${DEPLOY_VPS_PASS:-}"
DOMAIN="${DEPLOY_SITE_DOMAIN:-smartlocker.iotsoft.in}"
WWW_DOMAIN="${DEPLOY_SITE_WWW_DOMAIN:-www.smartlocker.iotsoft.in}"
SITE_DIR="${DEPLOY_SITE_DIR:-/root/projects/smart_locker/site}"
SSL_EMAIL="${DEPLOY_SITE_SSL_EMAIL:-jenixindia@gmail.com}"
BACKEND_PORT="${DEPLOY_BACKEND_PORT:-8080}"

if [ -z "$VPS_IP" ] || [ -z "$VPS_PASS" ]; then
  echo "ERROR: DEPLOY_VPS_IP and DEPLOY_VPS_PASS are required in .env.deploy"
  exit 1
fi

if ! command -v pscp >/dev/null 2>&1 || ! command -v plink >/dev/null 2>&1; then
  echo "ERROR: pscp/plink not found. Install PuTTY and add it to PATH."
  exit 1
fi

CONF_TMP="/tmp/smartlocker-nginx.conf"

echo "======================================================"
echo " Smart Locker - HTTPS Setup"
echo " Domain: $DOMAIN"
echo "======================================================"

sed \
  -e "s|__DOMAIN__|$DOMAIN|g" \
  -e "s|__WWW_DOMAIN__|$WWW_DOMAIN|g" \
  -e "s|__SITE_DIR__|$SITE_DIR|g" \
  -e "s|__BACKEND_PORT__|$BACKEND_PORT|g" \
  "$TEMPLATE_FILE" > "$CONF_TMP"

echo "[1/3] Uploading nginx config template..."
pscp -pw "$VPS_PASS" "$CONF_TMP" "$VPS_USER@$VPS_IP:/tmp/smartlocker-nginx.conf"

echo "[2/3] Applying nginx config..."
plink -ssh "$VPS_USER@$VPS_IP" -pw "$VPS_PASS" -batch "
set -e
mkdir -p '$SITE_DIR'
mkdir -p /var/www/certbot
cp /tmp/smartlocker-nginx.conf /etc/nginx/sites-available/smartlocker
ln -sf /etc/nginx/sites-available/smartlocker /etc/nginx/sites-enabled/smartlocker
nginx -t
systemctl reload nginx
"

echo "[3/3] Issuing HTTPS certificate with certbot..."
plink -ssh "$VPS_USER@$VPS_IP" -pw "$VPS_PASS" -batch "
set -e
certbot --nginx -d '$DOMAIN' -d '$WWW_DOMAIN' --non-interactive --agree-tos -m '$SSL_EMAIL' || true
nginx -t
systemctl reload nginx
"

rm -f "$CONF_TMP"
echo "HTTPS setup command completed. Please verify https://$DOMAIN"
