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
#define DEFAULT_DRAWER_STRATEGY "fixed"
#define DEFAULT_FIXED_DRAWER_ID 1
#define DEFAULT_IDENTITY_MODE "phone_otp"
