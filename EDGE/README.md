# EDGE Workspace

## Purpose

ESP32-C3 firmware layer for cabinet decision-making and lock control.

## Current Dev Build

`firmware/` now includes a flashable LAN test build with:

1. Wiegand read decode (26/34 and raw 50-bit)
2. DW RS485 protocol commands (`0x50`, `0x51`, `0x40`, `0x7B`)
3. Browser UI served from C3 at `http://<device-ip>/`

See [firmware/README.md](/d:/IOT Device/Smart Cabinet/EDGE/firmware/README.md) for flash and test steps.
For validated hardware steps and known pitfalls, see [HARDWARE_TEST_RUNBOOK.md](/d:/IOT Device/Smart Cabinet/EDGE/docs/HARDWARE_TEST_RUNBOOK.md).

## Core Responsibilities

1. Decode inputs (Wiegand, BLE, future face TCP)
2. Apply local rules offline
3. Send RS485 commands to Dewod lock board
4. Keep local storage consistent
5. Support OTA with rollback

## Priority Modules

1. `components/rs485_dw`: protocol encoder/decoder + CRC + retries
2. `components/storage`: NVS/LittleFS repository layer
3. `components/rule_engine`: access policy decisions
4. `components/input_wiegand`: card reader adapter
5. `components/ota`: secure OTA implementation

## First Implementation Targets

1. Add `rs485_dw` frame builder and parser
2. Add CRC8 tests with vectors from `docs/RS485_DW_PROTOCOL.md`
3. Add lock open transaction API:
   - `open_lock(board_addr, lock_addr)`
   - `query_lock_status(board_addr)`

## Coding Standards

1. Keep protocol constants in one header
2. Return explicit error codes for timeout/crc/format
3. Avoid dynamic allocation in hot paths where possible

## References

- `../docs/RS485_DW_PROTOCOL.md`
- `../docs/SYSTEM_CONTRACTS.md`
