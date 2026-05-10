# EDGE Firmware (C3 LAN PWA Build)

This firmware is a development build for:

1. Wiegand card read validation (26/34 and raw 50-bit pass-through)
2. DW lock board RS485 command testing
3. Installable LAN PWA for operator access, transaction export, and live drawer animation

## Features

- Wiegand decode from D0/D1 interrupt capture
- DW RS485 protocol support:
  - `0x50` open single lock
  - `0x51` query lock status
  - `0x40` query infrared status
  - `0x7B` query board version
- CRC8 implementation matching DW manual (`0x8C` loop)
- Built-in LAN PWA at `http://<device-ip>/`
- Dynamic RS485 scan and profile hints:
  - board address scan `0-15`
  - auto-fill active board ID
  - channel mode selector (`Auto` / `12CH` / `24CH`)
  - lock range helper (`0-11` for 12CH, `0-23` for 24CH)
- Local transaction ring buffer (last 100 records)
- CSV download for last 100 transactions
- Cabinet metadata + layout editor in LAN UI
- Device-side persistence for cabinet metadata and operation mode (NVS)
- Device-side persistent policy store (users/rules/drawers/license/sync meta in NVS)
- Wiegand rule-engine decision flow (card -> local policy evaluate -> RS485 open/deny)
- WG access mode control:
  - `Free Card` (default): no whitelist required
  - `Restricted`: whitelist/rule required
- PUT/WITHDRAW locker flow:
  - `PUT`: assigns locker to user/card
  - `WITHDRAW`: opens only previously assigned locker
  - deny message when no prior PUT assignment
- Per-user concurrent locker limit (`Allow Uses Type`, default `1`):
  - blocks PUT when user reached max active lockers
  - error includes locker number(s) already in use by that user
- Replay-window guard for duplicate Wiegand card bursts
- Live drawer open/close animation from lock-status polling
- Background EDGE <-> VPS sync worker (Iteration B baseline):
  - device self-register (when key missing and provision key is configured)
  - periodic config pull (`/v1/device/:id/config`) with config-version drift guard
  - periodic transaction log batch push (`/v1/device/:id/logs/batch`) with retry/backoff
  - sync status/telemetry endpoint (`/api/sync/status`)

## Folder Notes

- `src/main.cpp`: web server, PWA routes, transaction buffer, WiFi, and orchestration
- `src/wiegand_reader.cpp`: tested Wiegand frame handling logic
- `src/rs485_dw.cpp`: custom DW protocol driver
- `include/device_config.h`: defaults and configurable macros
- `include/local_config.example.h`: copy as your local config

## 1) Configure WiFi and Pins

Copy example file:

```powershell
Copy-Item .\include\local_config.example.h .\include\local_config.h
```

Edit `include/local_config.h` with:

- `WIFI_SSID`
- `WIFI_PASSWORD`
- Wiegand pins if different
- RS485 RX/TX and optional DIR pin
- Cabinet defaults (`CABINET_ID_2D`, cabinet name/location, drawer count)
- VPS sync defaults (`VPS_BASE_URL`, `VPS_DEVICE_ID`, `VPS_CABINET_ID`, `VPS_TENANT_ID`, `VPS_DEVICE_API_KEY`)

## 2) Build

```powershell
pio run -d .\EDGE\firmware
```

## 3) Flash (after connecting ESP32-C3)

Check port first:

```powershell
pio device list
```

Flash:

```powershell
pio run -d .\EDGE\firmware -t upload --upload-port COM12
```

Replace `COM12` with your detected port.

## 4) Monitor Logs

```powershell
pio device monitor -b 115200 --port COM12
```

## 5) Open LAN PWA

- If WiFi connected: open `http://<C3_IP>/`
- If WiFi not configured: device starts fallback AP `SmartCabinet-C3-Setup`

Dashboard provides:

1. Live health and IP state
2. Cabinet layout editor (name/location/id/drawers/board)
3. Last and recent Wiegand reads
4. RS485 lock open command form
5. RS485 lock status / IR / version query buttons
6. Operation mode settings (QR / WG machine / QR+password / emergency + free/restricted + put/withdraw + allow uses type)
7. Last-100 transaction table + CSV export
8. Layout import/export and live status animation

## API Endpoints

- `GET /`
- `GET /manifest.webmanifest`
- `GET /sw.js`
- `GET /api/health`
- `GET /api/sync/status`
- `GET /api/cabinet/meta`
- `POST /api/cabinet/meta?cabinet_id=01&name=...&location=...&drawers=24&board=0`
- `GET /api/ops/mode`
- `POST /api/ops/mode?method=wg_machine&drawer_strategy=sequence&fixed_drawer_id=1&identity_mode=phone_otp&wg_access_mode=free_card&locker_intent=put&allow_uses_type=1`
- `GET /api/wg/latest`
- `GET /api/wg/recent`
- `GET /api/policy`
- `POST /api/policy/reset`
- `POST /api/policy/seed-defaults`
- `POST /api/policy/license?state=active&valid_to=0`
- `POST /api/policy/sync?config_version=2&last_sync_ts=1710000000`
- `POST /api/policy/users/upsert?user_id=u1&card_id=13-52061`
- `POST /api/policy/rules/upsert?rule_id=r1&user_id=u1&drawer_id=1&cooldown_sec=30`
- `POST /api/policy/drawers/upsert?drawer_id=1&board=0&lock=0`
- `POST /api/rs485/open?board=<0..255>&lock=<0..255>&user=<optional>&intent=put|withdraw&drawer_id=<optional>`
- `GET /api/rs485/lock-status?board=<0..255>`
- `GET /api/rs485/ir-status?board=<0..255>`
- `GET /api/rs485/version?board=<0..255>`
- `GET /api/rs485/scan` (scan board addresses `0..15`)
- `GET /api/tx/recent?limit=100`
- `GET /api/tx/download.csv?limit=100`
- `GET /api/debug/heap`
- `POST /api/debug/panic?confirm=YES_CRASH&mode=abort` (debug only)
- `POST /api/debug/panic?confirm=YES_CRASH&mode=null` (debug only)

## Panic / Heap Debug Workflow

1. Start capture script (captures panic logs and auto-runs `addr2line`):

```powershell
powershell -ExecutionPolicy Bypass -File .\EDGE\firmware\tools\capture_panic.ps1 -Port COM12 -DurationSec 30
```

2. Trigger a controlled panic when needed:

```powershell
Invoke-WebRequest -Method Post -UseBasicParsing "http://<device-ip>/api/debug/panic?confirm=YES_CRASH&mode=abort"
```

3. Check heap integrity anytime:

```powershell
Invoke-WebRequest -UseBasicParsing "http://<device-ip>/api/debug/heap"
```

Notes:

- This project now runs periodic heap integrity checks and aborts immediately on corruption.
- The default Arduino framework for ESP32 in PlatformIO uses precompiled ESP-IDF libs, so panic/core-dump destination (`flash` vs `UART` vs `gdbstub`) is not directly switchable from sketch-level code alone.

## Sync Evidence Capture (Iteration B)

Capture sync telemetry for outage/recovery or drift verification:

```powershell
powershell -ExecutionPolicy Bypass -File .\EDGE\firmware\tools\sync_evidence.ps1 -DeviceBaseUrl "http://192.168.1.80" -DurationSec 300 -IntervalSec 5 -OutCsv .\EDGE\firmware\sync_evidence.csv
```

Live sync telemetry endpoint:

- `GET /api/sync/status`

## Transaction Protocol Field (LAN Export)

Each transaction record includes `protocol_code` in format:

1. First 2 chars: cabinet ID (`cabinet_id_2d`)
2. Next 6 chars: `HHMMSS`
3. Last 2 chars: user HEX tail + state bit (`1=open`, `0=close/deny`)

Example: `01143022B1`

## Hardware Notes

- RS485 board protocol/CRC matches the supplier DW documentation.
- If you use MAX485-like transceiver needing TX/RX direction control, set `RS485_DIR_PIN`.
- If your RS485 converter auto-controls direction, keep `RS485_DIR_PIN = -1`.
- Validated field setup (2026-05-08):
  - board detected at address `0`
  - version response: `DW-SK-HW-V1.05`
  - active board type during test: `12CH`
- Validated HW-726 TTL mapping in this session:
  - ESP32 `GPIO7` -> module `TXD`
  - ESP32 `GPIO6` -> module `RXD`
- Important TTL wiring note for HW-726:
  - header labels and side-socket labels can be interpreted differently
  - if no RS485 reply, swap TTL `TX/RX` once before deeper debugging

For the full validated checklist, see `EDGE/docs/HARDWARE_TEST_RUNBOOK.md`.
