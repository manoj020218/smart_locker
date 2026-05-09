#pragma once

#ifdef __has_include
#if __has_include("local_config.h")
#include "local_config.h"
#endif
#endif

#ifndef DEVICE_HOSTNAME
#define DEVICE_HOSTNAME "smart-cabinet-c3"
#endif

#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif

#ifndef AP_FALLBACK_SSID
#define AP_FALLBACK_SSID "SmartCabinet-C3-Setup"
#endif

#ifndef AP_FALLBACK_PASSWORD
#define AP_FALLBACK_PASSWORD "12345678"
#endif

#ifndef WG_D0_PIN
#define WG_D0_PIN 3
#endif

#ifndef WG_D1_PIN
#define WG_D1_PIN 2
#endif

#ifndef RS485_TX_PIN
#define RS485_TX_PIN 7
#endif

#ifndef RS485_RX_PIN
#define RS485_RX_PIN 6
#endif

#ifndef RS485_DIR_PIN
#define RS485_DIR_PIN -1
#endif

#ifndef RS485_BAUD
#define RS485_BAUD 9600
#endif

#ifndef RS485_REPLY_TIMEOUT_MS
#define RS485_REPLY_TIMEOUT_MS 250
#endif

#ifndef CABINET_ID_2D
#define CABINET_ID_2D "01"
#endif

#ifndef CABINET_NAME
#define CABINET_NAME "Smart Cabinet"
#endif

#ifndef CABINET_LOCATION
#define CABINET_LOCATION "LAN"
#endif

#ifndef DEFAULT_DRAWER_COUNT
#define DEFAULT_DRAWER_COUNT 24
#endif

#ifndef DEFAULT_BOARD_ADDR
#define DEFAULT_BOARD_ADDR 0
#endif

#ifndef DEFAULT_OP_METHOD
#define DEFAULT_OP_METHOD "qr"
#endif

#ifndef DEFAULT_DRAWER_STRATEGY
#define DEFAULT_DRAWER_STRATEGY "sequence"
#endif

#ifndef DEFAULT_FIXED_DRAWER_ID
#define DEFAULT_FIXED_DRAWER_ID 1
#endif

#ifndef DEFAULT_IDENTITY_MODE
#define DEFAULT_IDENTITY_MODE "phone_otp"
#endif

#ifndef DEFAULT_WG_ACCESS_MODE
#define DEFAULT_WG_ACCESS_MODE "free_card"
#endif

#ifndef DEFAULT_LOCKER_INTENT
#define DEFAULT_LOCKER_INTENT "put"
#endif

#ifndef DEFAULT_ALLOW_USES_TYPE
#define DEFAULT_ALLOW_USES_TYPE 1
#endif
