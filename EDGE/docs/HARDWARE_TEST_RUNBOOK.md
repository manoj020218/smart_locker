# Hardware Test Runbook (WG + RS485)

Last updated: 2026-05-07

## 1) Purpose

This runbook records the validated hardware test path so future developers can repeat testing without wiring/protocol mistakes.

## 2) Validated Bench Result

1. Wiegand read working
2. RS485 handshake working
3. Control board detected on address `0`
4. Version reply captured: `DW-SK-HW-V1.05`
5. Test board in session: `12CH`

## 3) Firmware Baseline

Test firmware location:

- `EDGE/firmware/`

LAN test page:

- `http://<device-ip>/`

Key API checks:

1. `GET /api/rs485/scan`
2. `GET /api/rs485/version?board=0`
3. `GET /api/rs485/lock-status?board=0`
4. `POST /api/rs485/open?board=0&lock=0`

## 4) Wiegand Wiring (Validated)

1. Reader `D0` -> ESP32-C3 `GPIO3`
2. Reader `D1` -> ESP32-C3 `GPIO2`
3. Reader `GND` -> ESP32-C3 `GND` (common ground mandatory)

## 5) RS485 Wiring (Validated Path)

ESP32-C3 firmware pins used:

1. RS485 TX pin: `GPIO7`
2. RS485 RX pin: `GPIO6`
3. RS485 DIR pin: not required (`-1`) for auto-direction module

TTL-RS485 module (HW-726 style):

1. Validated in this bench session: `GPIO7` -> module `TXD`
2. Validated in this bench session: `GPIO6` -> module `RXD`
3. ESP32 `GND` -> module `GND`
4. Module `A+` -> lock board `A`
5. Module `B-` -> lock board `B`
6. Module `GND` -> lock board `GND`

Important:

1. On HW-726, top-header and side-socket labels can be interpreted differently.
2. If no reply, swap TTL TX/RX once.
3. If still no reply, swap A/B once.

## 6) Protocol Truth

Serial settings:

1. `9600`
2. `8N1`
3. No parity

Frame:

- `AA 55 LEN ADDR CMD DATA CRC8`

CRC8:

- Polynomial loop behavior `0x8C` (vendor appendix compatible)

Known-good request examples:

1. Version query board 0: `AA 55 02 00 7B 40`
2. Lock status board 0: `AA 55 02 00 51 1D`

Known-good reply examples:

1. Version: `AA 55 11 00 7B 44 57 2D 53 4B 2D 48 57 2D 56 31 2E 30 35 00 0E`
2. Lock status: `AA 55 08 00 51 00 F0 FF FF FF FF 36`

## 7) Dynamic UI Behavior

The LAN page supports dynamic behavior after scan:

1. Scans board addresses `0..15`
2. Auto-fills active board ID
3. Displays detected version
4. Channel mode selector:
   - `Auto`
   - `12CH`
   - `24CH`
5. Lock address range helper:
   - `0..11` for 12CH
   - `0..23` for 24CH

Note:

Version string may not always explicitly include `K12` or `K24`. Keep manual channel override available.

## 8) No-Mistake Test Sequence

1. Confirm common GND across ESP32, WG reader, RS485 module, and lock board.
2. Verify WG card event appears in LAN page.
3. Click RS485 `Scan Addr 0-15`.
4. Confirm one board returns `ok:true` (expected board `0` in current setup).
5. Run `Lock Status` on detected board.
6. Run `Open Lock` for valid lock range only.

## 9) Failure Map

`reply_timeout_or_short` with non-empty `tx_hex` and empty `rx_hex` means:

1. TTL TX/RX wrong
2. A/B reversed
3. Missing ground
4. Wrong board address
5. Power issue on transceiver or lock board

`crc_mismatch` means:

1. Electrical noise or framing error
2. Wrong baud/parity/stop setting

## 10) Change Control Rule

Any change to:

1. RS485 pins
2. Transceiver module type
3. Board addressing policy
4. Channel count assumptions

must update this runbook and `docs/RS485_DW_PROTOCOL.md` in the same change.
