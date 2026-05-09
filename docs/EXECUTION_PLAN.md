# Execution Plan

Last updated: 2026-05-09
Plan version: 1.1

## 1) Phase Plan

### Phase 1 (MVP)

Scope:

1. Wiegand input -> rule engine -> RS485 unlock
2. Admin mobile app (BLE provisioning + user/rule config)
3. Minimal VPS (license, config sync, logs, OTA manifest)

Acceptance:

1. >=99.5% successful unlock in controlled test
2. Offline unlock support for >=72h without VPS
3. Reboot recovery without local data corruption

### Phase 1.1 (LAN Operator PWA)

Scope:

1. Installable LAN PWA served by EDGE for same-network operator access.
2. Live cabinet layout view with open/close animation based on RS485 feedback status.
3. Last 100 transaction records available locally with CSV download.
4. Admin operation mode selection in LAN dashboard:
   - QR flow with drawer strategy (fixed/random/reuse previous drawer)
   - WG machine flow (RFID/face/password terminal integration mode)
   - QR + 6-digit deposit/retrieval password flow
   - Emergency admin unlock mode (Bluetooth-assisted workflow placeholder for EDGE-BLE integration)
5. Local-first retention policy:
   - Device keeps latest 100 transactions in rolling buffer.
   - UI prompts operator to export older records to local PC storage.
   - Cloud storage escalation remains optional ("Ask Quote" path).

Acceptance:

1. PWA opens on LAN over `http://<device-ip>/` and is installable.
2. Transaction CSV download contains latest 100 entries with protocol code field.
3. Layout metadata (cabinet name/location/id/drawer count/mode) is editable from LAN UI and persists at least in operator browser storage.
4. Drawer state animation updates from live status polling without full page reload.

### Phase 2

Scope:

1. Face machine input integration over TCP/IP
2. Extended sync diagnostics and field telemetry

### Phase 3

Scope:

1. Guest app login and token flow over BLE
2. End-to-end automated user journey

## 2) 5-Week Build Plan

### Week 1

1. Build `EDGE rs485_dw` driver and tests
2. Finalize board/drawer mapping schema
3. Implement CRC and parser unit tests

### Week 2

1. Implement EDGE local storage module
2. Implement rule engine and decision flow
3. Integrate Wiegand input pipeline

### Week 3

1. BLE admin provisioning flows
2. VPS auth/license/sync/log endpoints
3. MongoDB schema and indexes

### Week 4

1. Admin app wiring to BLE and VPS
2. OTA manifest, fetch, verify, rollback flow
3. End-to-end cabinet simulation tests

### Week 5

1. Hardware pilot on real lock board
2. Reliability fixes and final hardening
3. Release candidate sign-off

### Week 6 (LAN PWA + Ops Modes)

1. Implement EDGE LAN PWA shell (`manifest`, service worker, offline assets).
2. Add transaction event ring buffer (100 records) and CSV export endpoint.
3. Add cabinet layout editor and live drawer animation panel.
4. Add operation mode configuration UI and persistence model.
5. Define BLE emergency unlock handshake contract for next firmware slice.

## 3) Workstream Ownership

1. EDGE: firmware and hardware protocol behavior
2. VPS: APIs, Mongo models, auth, OTA control
3. APK/PWA: React Native admin UX plus LAN PWA operator workflow
4. QA: protocol tests, soak tests, pilot validation

## 4) Risk Register

1. RS485 bus noise in field environment
2. Improper channel mode usage (`0x41`) causing lock damage
3. Power loss during write or OTA swap
4. Sync drift between local and server rules
5. Ambiguous user identity in QR-password flow when no authenticated member account exists
6. Incomplete close-feedback coverage if status polling interval is too slow
7. Browser-only persistence loss for layout/mode settings if local storage is cleared

## 5) Mitigations

1. Retries + CRC + status re-query
2. Guardrails around `0x41` in firmware and admin app
3. Atomic config writes and OTA rollback
4. Versioned config with conflict policy
5. Add explicit identity options in QR-password mode:
   - phone+OTP
   - membership ID entry
   - one-time session token
6. Use bounded polling plus transition-detection logic for open/close events.
7. Add export/import JSON for layout settings and optional EDGE-side persistence in later slice.

## 6) Definition of Done

A feature is complete only when:

1. Contract docs are updated
2. Unit/integration tests pass
3. Hardware evidence is attached for EDGE changes
4. Rollback path is documented
