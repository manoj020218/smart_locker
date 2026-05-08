# Smart Cabinet System

Last updated: 2026-05-08
Owner: Smart Cabinet Team

## 1) Project Summary

This repository contains the full Smart Cabinet platform in three deployable layers:

- EDGE: ESP32-C3 firmware and hardware integration (offline-first controller)
- VPS: Backend services and dashboard APIs (minimal cloud dependency)
- APK: Mobile applications (Admin first, Guest in Phase 3)

The system is modular and supports phased product release:

1. Phase 1 (MVP): Wiegand + ESP32-C3 + RS485 lock board + Admin app
2. Phase 2: Face machine integration (TCP/IP input into same rule engine)
3. Phase 3: Guest app token flow over BLE

## 1.1) Current Progress Snapshot (2026-05-08)

Completed and verified:

1. EDGE Wiegand input is working and tested on hardware.
2. Wiegand pins validated: `D0=GPIO3`, `D1=GPIO2`.
3. RS485 custom Dewod protocol implemented in EDGE test firmware and verified on real board.
4. RS485 UART mapping validated: `TX=GPIO20`, `RX=GPIO21` (TTL-RS485 module side must be wired correctly; common GND is mandatory).
5. RS485 board detection by version command (`0x7B`) is working; live response confirmed (`DW-SK-HW-V1.05`).
6. EDGE LAN interactive test UI is available on device IP for quick bench testing before Admin APK rollout.
7. VPS backend (`VPS/api`) is live with Phase 1 endpoints (auth/device/config/logs/license/ota/admin/apk metadata).
8. Firebase auth verification hardened:
   - production bypass is disabled
   - invalid ID token now returns `401`
   - manual JWT verification fallback added when Firebase Admin credentials are unavailable.
9. VPS backend deploy scripts switched to `pnpm` and validated on server (`pnpm` available on VPS).
10. Public marketing + Google Play policy/support pages are deployed with HTTPS.
11. Google Tag Manager container `GTM-PDGV22QC` added to all public pages (`head` + `noscript`).

In progress / pending:

1. MongoDB cutover from shared `qrunlock` database to dedicated `smart_locker` database is pending.
2. Cutover is blocked by current VPS SSH credential rejection (`root@154.61.69.200` password not accepted in latest session).
3. Admin/Guest APK feature development is still pending beyond current backend + website baseline.

## 2) Technical Decisions (Frozen)

These decisions are final unless explicitly changed in this document:

1. RS485 lock control protocol: Custom protocol from Dewod/Dewo K24/K12 board manual
2. Mobile stack: React Native (TypeScript)
3. VPS database: Existing MongoDB instance
4. Firebase usage: Google login auth and FCM only
5. OTA: Enabled from initial firmware architecture (day one)
6. System behavior: Offline-first, with optional cloud sync
7. Cloud strategy: Free/open components first, minimal VPS load

## 3) Repository Layout

```text
Smart Cabinet/
  README.md
  docs/
    EXECUTION_PLAN.md
    RS485_DW_PROTOCOL.md
    SYSTEM_CONTRACTS.md
  EDGE/
    README.md
    firmware/
      main/
      components/
        rs485_dw/
        rule_engine/
        storage/
        input_wiegand/
        input_ble/
        input_face_tcp/
        mqtt_sync/
        ota/
        security/
      test/
      tools/
    hardware/
    docs/
  VPS/
    README.md
    api/
      src/
        modules/
          auth/
          license/
          cabinet/
          sync/
          logs/
          ota/
          agent/
          payment/
        adapters/
          mongo/
          firebase/
        shared/
    dashboard/
    deploy/
    docs/
  APK/
    README.md
    apps/
      admin/
      guest/
    packages/
      shared/
      protocol/
    docs/
  tools/
```

## 4) Runtime Architecture

```text
Input Layer (Card / Face / App Token)
  -> EDGE (ESP32-C3: rule engine + local DB + RS485 driver)
  -> Lock Control Board (DW K24/K12 over RS485)
  -> Drawers/Locks

Optional Cloud Layer
  -> VPS API (license, sync, logs, OTA manifest)
  -> MongoDB
  -> Firebase Auth + FCM
  -> Admin/Guest mobile apps
```

## 5) RS485 Contract (Critical)

Primary reference is documented in:

- `docs/RS485_DW_PROTOCOL.md`
- supplier documents (`commands.pdf`, `K12 Locking Control Board User Manual-V1.1`)

Communication parameters:

- Physical: RS485, half duplex
- Serial: 9600 baud, 8 data bits, no parity, 1 stop bit (8N1)

Frame format:

- `AA 55 LEN ADDR CMD DATA... CRC8`
- `LEN = 1 byte ADDR + 1 byte CMD + N bytes DATA`
- CRC8 polynomial behavior per vendor sample code: `0x8C` looped LSB-first

Important commands used by this project:

1. `0x50` Open single lock (`DATA = lock_addr, 0-based`)
2. `0x51` Query all lock status (6-byte bitmap reply)
3. `0x40` Query infrared status (6-byte bitmap reply)
4. `0x7B` Query firmware version of lock board
5. `0xF0` Open all locks (no reply)
6. `0x41` Channel mode control (normally closed/open, caution)

No-reply commands (do not wait for ACK):

- `0xF0` open all locks
- broadcast lighting command with address `0xFF` and `0x54`

## 6) Drawer Addressing Plan (60 Drawers)

Default mapping for a 60-drawer cabinet with multiple boards:

1. Board address `0x01`: drawers 1-24 (lock addresses 0-23)
2. Board address `0x02`: drawers 25-48 (lock addresses 0-23)
3. Board address `0x03`: drawers 49-60 (lock addresses 0-11)

All mappings must be stored in EDGE local config and synced to VPS.

## 7) Development Rules

1. EDGE must operate without internet for core unlock flow.
2. Cloud outage must not block card/token validation when local policy is valid.
3. Any protocol or payload change must update `docs/SYSTEM_CONTRACTS.md`.
4. Never bypass CRC validation in production firmware.
5. OTA update must support rollback on failed boot.

## 8) Local Data Contracts

EDGE local store (NVS/LittleFS):

```json
{
  "device": {"device_id": "", "cabinet_id": "", "license_state": "active"},
  "drawers": [{"drawer_id": 1, "board_address": 1, "lock_address": 0}],
  "users": [{"user_id": "", "card_id": "", "face_id": "", "token_pub": ""}],
  "rules": [{"rule_id": "", "drawer_id": 1, "valid_from": 0, "valid_to": 0, "cooldown_sec": 28800}],
  "sync": {"last_sync_ts": 0, "config_version": 1}
}
```

VPS MongoDB collections:

- `devices`
- `cabinets`
- `users`
- `drawer_mappings`
- `rules`
- `access_logs`
- `licenses`
- `ota_releases`
- `agents`
- `payments`

## 9) MVP Scope (Phase 1)

Included now:

1. Wiegand input -> rule check -> RS485 unlock
2. Admin app onboarding/config over BLE
3. Local user/rule database on EDGE
4. Basic VPS sync for backup, logs, license state
5. OTA manifest + firmware pull + rollback

Not included in Phase 1:

1. Face machine TCP/IP adapter
2. Guest token BLE flow
3. Advanced payment automation

## 10) Build Order (Execution)

1. Implement and test `EDGE/components/rs485_dw`
2. Implement `rule_engine` and `storage`
3. Integrate `input_wiegand` and unlock pipeline
4. Implement BLE admin provisioning
5. Bring up VPS minimal APIs (auth, license, sync, logs, ota)
6. Bring up APK Admin app for onboarding/config
7. End-to-end pilot on hardware

## 11) Quick Start for New Developers

1. Read this file fully.
2. Read `docs/RS485_DW_PROTOCOL.md`.
3. Read `docs/SYSTEM_CONTRACTS.md`.
4. Read area-specific README:
   - `EDGE/README.md`
   - `VPS/README.md`
   - `APK/README.md`
5. Pick one module and update contracts before code changes.
6. For bench wiring/test safety, read `EDGE/docs/HARDWARE_TEST_RUNBOOK.md`.

## 12) Handover Standard

Every significant implementation PR must include:

1. What changed
2. Why changed
3. Impacted contracts/endpoints/commands
4. Test evidence (unit/integration/hardware)
5. Rollback steps

If this standard is followed, any developer can continue the project without prior chat history.

## 13) Hardware Validation Snapshot

Latest bench validation (2026-05-08):

1. Wiegand working on `D0=GPIO3`, `D1=GPIO2`.
2. Common GND issue was found and fixed; this is mandatory for stable reader + RS485 behavior.
3. RS485 working with DW board address `0` after correcting TTL wiring direction.
4. ESP32 UART mapping in firmware: `TX=GPIO20`, `RX=GPIO21`.
5. Verified version reply using command `0x7B`: `DW-SK-HW-V1.05`.
6. RS485 scan endpoint and dynamic UI board profile are active in EDGE test firmware.

Use `EDGE/docs/HARDWARE_TEST_RUNBOOK.md` for the exact no-mistake wiring and troubleshooting sequence.
