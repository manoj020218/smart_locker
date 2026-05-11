#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://smartlocker.iotsoft.in"
IDENTIFIER="mfr.demo.smarthub@iotsoft.in"
PASSWORD="MfrDemo#2026"
OWNER_EMAIL=""
OWNER_PASSWORD="Owner#12345"
CABINET_ID=""
CABINET_NAME="Demo Cabinet"
CABINET_LOCATION="Demo Site"
CABINET_MODE="DEMO"
FCM_TOKEN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="$2"; shift 2 ;;
    --identifier) IDENTIFIER="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --owner-email) OWNER_EMAIL="$2"; shift 2 ;;
    --owner-password) OWNER_PASSWORD="$2"; shift 2 ;;
    --cabinet-id) CABINET_ID="$2"; shift 2 ;;
    --cabinet-name) CABINET_NAME="$2"; shift 2 ;;
    --cabinet-location) CABINET_LOCATION="$2"; shift 2 ;;
    --cabinet-mode) CABINET_MODE="$2"; shift 2 ;;
    --fcm-token) FCM_TOKEN="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

export BASE_URL="$BASE_URL"
export MFR_IDENTIFIER="$IDENTIFIER"
export MFR_PASSWORD="$PASSWORD"
if [[ -n "$OWNER_EMAIL" ]]; then export OWNER_EMAIL="$OWNER_EMAIL"; fi
if [[ -n "$OWNER_PASSWORD" ]]; then export OWNER_PASSWORD="$OWNER_PASSWORD"; fi
if [[ -n "$CABINET_ID" ]]; then export CABINET_ID="$CABINET_ID"; fi
if [[ -n "$CABINET_NAME" ]]; then export CABINET_NAME="$CABINET_NAME"; fi
if [[ -n "$CABINET_LOCATION" ]]; then export CABINET_LOCATION="$CABINET_LOCATION"; fi
if [[ -n "$CABINET_MODE" ]]; then export CABINET_MODE="$CABINET_MODE"; fi
if [[ -n "$FCM_TOKEN" ]]; then export FCM_TOKEN="$FCM_TOKEN"; fi

cd "$API_ROOT"
if command -v pnpm >/dev/null 2>&1; then
  pnpm run smoke:manufacturer
else
  npm run smoke:manufacturer
fi
