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
