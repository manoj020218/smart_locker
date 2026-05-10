# Execution Plan

Last updated: 2026-05-10
Plan version: 1.4

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

## 7) Final Progress Snapshot (Reality Check)

Status date: 2026-05-10
Assessment source: all repository Markdown files + current implementation files in `EDGE/firmware` and `VPS/api`, plus successful local firmware build/flash and LAN API validation (`pio run` + `upload` + endpoint checks, 2026-05-10) including Iteration B sync worker reliability fixes.

### Phase 1 (MVP) Status

1. Wiegand input -> rule engine -> RS485 unlock: `DONE (baseline code)`
   - Wiegand decode is implemented.
   - RS485 driver + lock/status/version commands are implemented.
   - Local policy store module is implemented for users/rules/drawers/license/sync state (NVS persisted).
   - Rule engine module is implemented and wired to Wiegand callback for automatic open/deny decisions.
   - Replay-window guard is implemented for duplicate Wiegand bursts.
2. Admin mobile app (BLE provisioning + user/rule config): `PENDING`
   - APK workspace is scaffold-only (`.gitkeep` placeholders).
3. Minimal VPS (license/config sync/logs/OTA manifest): `DONE (baseline)`
   - Core API routes are implemented and wired in Express.
   - Mongo collections and indexes are implemented.
   - Firebase token verification + secure fallback validation are implemented.

### Phase 1 Acceptance Criteria Status

1. `>=99.5%` successful unlock in controlled test: `PENDING EVIDENCE`
2. Offline unlock support for `>=72h` without VPS: `PENDING EVIDENCE`
3. Reboot recovery without local data corruption: `PARTIAL`
   - Cabinet meta and ops mode persist in NVS.
   - User/rule/drawer/license/sync local policy data also persists in NVS.
   - Power-loss recovery evidence test is still pending.

### Phase 1.1 (LAN Operator PWA) Status

1. Installable LAN PWA served by EDGE: `DONE`
2. Live cabinet layout with open/close animation from RS485 polling: `DONE`
3. Last 100 transactions + CSV download: `DONE`
4. Operation mode selection UI (QR/WG/QR+password/admin emergency placeholder): `DONE`
5. Local-first retention messaging + export workflow: `DONE`

### Phase 2 Status

1. Face machine input integration over TCP/IP: `PENDING`
2. Extended sync diagnostics and field telemetry: `PARTIAL`
   - EDGE now exposes `/api/sync/status` telemetry.
   - Background EDGE sync worker (register/config-pull/log-push/retry-backoff) is implemented as baseline.
   - Register-recovery path now rotates key when local device key is missing, and LAN PWA now shows live VPS connection status.
   - Local policy persistence now includes self-healing for incompatible/stale blobs and save-retry behavior.
   - Field reliability and outage-recovery evidence are still pending.

### Phase 3 Status

1. Guest app login/token BLE flow: `PENDING`
2. End-to-end automated user journey: `PENDING`

## 8) Done vs Left (Delivery View)

### Done

1. EDGE LAN firmware with live dashboard, RS485 controls, Wiegand read view, transaction ring buffer, and CSV export.
2. EDGE persistence for cabinet metadata + operation mode using NVS.
3. EDGE rule engine + local policy store (users/rules/drawers/license/sync) with Wiegand auto decision flow.
4. Replay-safe decision logging (`open/deny`) with local policy management endpoints on EDGE LAN API.
5. VPS API baseline for auth, device registration/config sync, logs, license, OTA manifest, and APK version metadata.
6. Public website and Google Play policy/support pages are present in repo.
7. Hardware validation docs and RS485 protocol contract are documented.
8. Iteration B baseline sync loop is implemented on EDGE:
   - periodic config pull (`/v1/device/:id/config`)
   - periodic log batch push (`/v1/device/:id/logs/batch`)
   - config-version regression skip guard
   - retry/backoff and status telemetry endpoint (`/api/sync/status`)
9. Stable domain sync routing baseline is set (`https://smartlocker.iotsoft.in`) so VPS host migration can be handled by DNS/proxy without firmware endpoint contract changes.
10. VPS device-registration hardening is added:
   - provision-key gate can be enforced by default
   - optional device-id allowlist
   - device identity mismatch checks (cabinet/tenant) during register
11. EDGE sync registration recovery is hardened:
   - when local key is missing, register request now asks key rotation to avoid permanent `register_ok_but_missing_key` loops
   - firmware accepts either `api_key` or `device_key` response field for compatibility
12. EDGE policy-store persistence reliability is improved:
   - incompatible/stale policy blobs are removed and default compact blob is re-saved
   - save path retries once after blob removal when first write fails
13. LAN operator dashboard now includes explicit VPS connectivity panel:
   - status badge (`Connected`, `Needs Registration`, `Disabled`, `Disconnected`)
   - base URL, device ID, and last sync error visible from `http://<device-ip>/`

### Left

1. Complete EDGE <-> VPS sync evidence pack (outage/recovery, drift scenarios, log push with real transactions, and soak logs).
2. Build Admin APK (React Native) with BLE onboarding and user/rule/drawer configuration flows.
3. Add automated tests:
   - EDGE unit tests (CRC/parser/rule decisions)
   - VPS route + auth integration tests
   - End-to-end hardware soak tests and acceptance evidence
4. Execute MongoDB production cutover and deployment validation on VPS target (script/docs are now prepared).
5. Finalize OTA rollback evidence and release hardening checklist.

## 9) Execution Plan From This Point

### Iteration A - EDGE Core Completion (`COMPLETED: baseline implementation`)

1. Add `rule_engine` module and policy contracts.
2. Add persistent local store for users/rules/license/config version.
3. Wire Wiegand callback to policy decision and RS485 unlock call.
4. Add replay-safe transaction logging for decisions (`open/deny`).

Exit criteria:
1. Offline decision path works without LAN UI/manual API.
2. Controlled unlock pass-rate test script produces evidence logs (`PENDING`).

### Iteration B - VPS Hardening + Sync Reliability (`IN PROGRESS`)

1. Implement/verify config pull cadence and log batch push from EDGE. `CODED (evidence test pending)`
2. Add conflict/version checks and explicit error telemetry fields. `CODED + LAN SMOKE VERIFIED (drift/outage validation pending)`
3. Complete Mongo cutover (`smart_locker`) and document migration steps. `DOCS+SCRIPT READY, PROD EXECUTION PENDING`

Exit criteria:
1. EDGE survives VPS outage and later re-syncs cleanly.
2. Config version drift tests pass.

### Iteration C - Admin APK MVP

1. Create RN app shell and auth bootstrap.
2. Implement BLE scan/connect/provision flow.
3. Implement user/rule/drawer management screens mapped to VPS APIs.
4. Add APK release publish/check workflow using existing VPS endpoints.

Exit criteria:
1. New cabinet can be provisioned from app without manual LAN API use.
2. Rule changes propagate to EDGE and affect unlock decisions.

### Iteration D - Pilot + Release Evidence

1. Run 72h offline/online mixed soak.
2. Collect unlock reliability metrics and reboot recovery evidence.
3. Finalize rollback runbooks and release sign-off package.

Exit criteria:
1. All Phase 1 acceptance criteria have measured evidence.
2. Candidate release is ready for pilot rollout.

## 10) Continuation Rule (Single Source of Truth)

1. Treat this file as execution source of truth for future sessions.
2. After every completed task, update:
   - section `7) Final Progress Snapshot`
   - section `8) Done vs Left`
3. Do not mark any item as `DONE` without code + test/hardware evidence.
