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
- Live drawer open/close animation from lock-status polling

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
6. Operation mode settings (QR / WG machine / QR+password / emergency)
7. Last-100 transaction table + CSV export
8. Layout import/export and live status animation

## API Endpoints

- `GET /`
- `GET /manifest.webmanifest`
- `GET /sw.js`
- `GET /api/health`
- `GET /api/cabinet/meta`
- `POST /api/cabinet/meta?cabinet_id=01&name=...&location=...&drawers=24&board=0`
- `GET /api/ops/mode`
- `POST /api/ops/mode?method=qr&drawer_strategy=fixed&fixed_drawer_id=1&identity_mode=phone_otp`
- `GET /api/wg/latest`
- `GET /api/wg/recent`
- `POST /api/rs485/open?board=<0..255>&lock=<0..255>&user=<optional>`
- `GET /api/rs485/lock-status?board=<0..255>`
- `GET /api/rs485/ir-status?board=<0..255>`
- `GET /api/rs485/version?board=<0..255>`
- `GET /api/rs485/scan` (scan board addresses `0..15`)
- `GET /api/tx/recent?limit=100`
- `GET /api/tx/download.csv?limit=100`

## Transaction Protocol Field (LAN Export)

Each transaction record includes `protocol_code` in format:

1. First 2 chars: cabinet ID (`cabinet_id_2d`)
2. Next 6 chars: `HHMMSS`
3. Last 2 chars: user HEX tail + state bit (`1=open`, `0=close`)

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
