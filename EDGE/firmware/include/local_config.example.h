#pragma once

// Copy this file as local_config.h and customize for your LAN.
// local_config.h is ignored by git to keep credentials private.

#define DEVICE_HOSTNAME "smart-cabinet-c3"

#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Optional AP fallback if STA connection is unavailable.
#define AP_FALLBACK_SSID "SmartCabinet-C3-Setup"
#define AP_FALLBACK_PASSWORD "12345678"

// Wiegand pins (tested earlier in your bridge code)
#define WG_D0_PIN 3
#define WG_D1_PIN 2

// RS485 UART pins and direction pin.
// Set RS485_DIR_PIN to -1 if your RS485 hardware auto-switches TX/RX direction.
#define RS485_TX_PIN 7
#define RS485_RX_PIN 6
#define RS485_DIR_PIN -1

// Cabinet metadata defaults used by LAN PWA transaction protocol and layout.
#define CABINET_ID_2D "01"
#define CABINET_NAME "Main Lobby Cabinet"
#define CABINET_LOCATION "Floor-1"
#define DEFAULT_DRAWER_COUNT 24
#define DEFAULT_BOARD_ADDR 0

// Operation mode defaults (can be changed at runtime from LAN PWA and persisted).
#define DEFAULT_OP_METHOD "qr"
#define DEFAULT_DRAWER_STRATEGY "sequence"
#define DEFAULT_FIXED_DRAWER_ID 1
#define DEFAULT_IDENTITY_MODE "phone_otp"
#define DEFAULT_WG_ACCESS_MODE "free_card"
#define DEFAULT_LOCKER_INTENT "put"
#define DEFAULT_ALLOW_USES_TYPE 1

// VPS sync (Iteration B)
// Keep this as stable public domain; move backend behind DNS/proxy without reflashing devices.
// Set empty string only if you intentionally want to disable EDGE<->VPS sync.
#define VPS_BASE_URL "https://smartlocker.iotsoft.in"
#define VPS_DEVICE_ID ""
#define VPS_CABINET_ID ""
#define VPS_TENANT_ID ""
#define VPS_HW_MODEL "esp32-c3"
#define VPS_FW_VERSION "edge-fw-dev"

// Device API key returned by POST /v1/device/register (first registration/rotation).
// If empty and VPS requires device auth, sync calls will fail with auth error until key is provisioned.
#define VPS_DEVICE_API_KEY ""

// Optional provision key used only for /v1/device/register.
#define VPS_PROVISION_KEY ""

#define EDGE_SYNC_PULL_INTERVAL_SEC 60
#define EDGE_SYNC_RETRY_MIN_SEC 10
#define EDGE_SYNC_RETRY_MAX_SEC 300
#define EDGE_SYNC_LOG_BATCH_SIZE 20
#define EDGE_SYNC_HTTP_TIMEOUT_MS 8000
