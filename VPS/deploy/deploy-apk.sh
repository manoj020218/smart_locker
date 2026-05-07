#!/bin/bash
set -e

# Smart Locker - APK Upload + Version Tracking
# Usage:
#   bash VPS/deploy/deploy-apk.sh <apk_file> <version> <build>
# Example:
#   bash VPS/deploy/deploy-apk.sh APK/apps/admin/android/app/build/outputs/apk/release/app-release.apk 1.0.0 1

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
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
APK_PUBLIC_DIR="${DEPLOY_APK_PUBLIC_DIR:-/root/projects/smart_locker/public/apk}"
APK_BASE_URL="${DEPLOY_APK_PUBLIC_BASE_URL:-https://example.com/apk}"
API_BASE_URL="${DEPLOY_API_BASE_URL:-}"
ADMIN_JWT="${DEPLOY_ADMIN_JWT:-}"

APK_FILE="${1:-}"
APK_VERSION="${2:-}"
APK_BUILD="${3:-}"
RELEASE_NOTES="${RELEASE_NOTES:-Manual release}"
MANDATORY="${MANDATORY_UPDATE:-false}"
MIN_SUPPORTED_BUILD="${MIN_SUPPORTED_BUILD:-0}"

if [ -z "$VPS_IP" ] || [ -z "$VPS_PASS" ]; then
  echo "ERROR: DEPLOY_VPS_IP and DEPLOY_VPS_PASS are required in .env.deploy"
  exit 1
fi

if [ -z "$APK_FILE" ] || [ -z "$APK_VERSION" ] || [ -z "$APK_BUILD" ]; then
  echo "ERROR: apk_file, version and build are required."
  echo "Usage: bash VPS/deploy/deploy-apk.sh <apk_file> <version> <build>"
  exit 1
fi

if [ ! -f "$APK_FILE" ]; then
  echo "ERROR: APK file not found: $APK_FILE"
  exit 1
fi

if ! command -v pscp >/dev/null 2>&1 || ! command -v plink >/dev/null 2>&1; then
  echo "ERROR: pscp/plink not found. Install PuTTY and add it to PATH."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required."
  exit 1
fi

TARGET_VERSIONED="smart-locker-v${APK_VERSION}.apk"
TARGET_LATEST="smart-locker-latest.apk"
APK_URL="${APK_BASE_URL}/${TARGET_VERSIONED}"
SAFE_RELEASE_NOTES="${RELEASE_NOTES//\"/\\\"}"

echo "======================================================"
echo " Smart Locker - APK Deploy"
echo " Version: $APK_VERSION  Build: $APK_BUILD"
echo " VPS: $VPS_USER@$VPS_IP:$APK_PUBLIC_DIR"
echo "======================================================"

echo "[1/3] Creating APK directory on VPS..."
plink -ssh "$VPS_USER@$VPS_IP" -pw "$VPS_PASS" -batch "mkdir -p '$APK_PUBLIC_DIR'"

echo "[2/3] Uploading APK..."
pscp -pw "$VPS_PASS" "$APK_FILE" "$VPS_USER@$VPS_IP:$APK_PUBLIC_DIR/$TARGET_VERSIONED"
plink -ssh "$VPS_USER@$VPS_IP" -pw "$VPS_PASS" -batch \
  "cp '$APK_PUBLIC_DIR/$TARGET_VERSIONED' '$APK_PUBLIC_DIR/$TARGET_LATEST'"

echo "[3/3] Updating version tracking via API..."
if [ -z "$API_BASE_URL" ] || [ -z "$ADMIN_JWT" ]; then
  echo "WARNING: DEPLOY_API_BASE_URL or DEPLOY_ADMIN_JWT missing. Skipping API version update."
  echo "Upload done. Manual API update required."
  exit 0
fi

PAYLOAD=$(cat <<JSON
{
  "platform":"android",
  "version":"$APK_VERSION",
  "build":$APK_BUILD,
  "url":"$APK_URL",
  "release_notes":"$SAFE_RELEASE_NOTES",
  "mandatory":$MANDATORY,
  "min_supported_build":$MIN_SUPPORTED_BUILD
}
JSON
)

curl -sS -X POST "$API_BASE_URL/v1/admin/apk/releases" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"

echo ""
echo "APK deploy done."
echo "Versioned URL: $APK_URL"
echo "Latest URL   : ${APK_BASE_URL}/${TARGET_LATEST}"
