# Execution Plan

Last updated: 2026-05-07
Plan version: 1.0

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

## 3) Workstream Ownership

1. EDGE: firmware and hardware protocol behavior
2. VPS: APIs, Mongo models, auth, OTA control
3. APK: React Native admin UX and guest-ready foundations
4. QA: protocol tests, soak tests, pilot validation

## 4) Risk Register

1. RS485 bus noise in field environment
2. Improper channel mode usage (`0x41`) causing lock damage
3. Power loss during write or OTA swap
4. Sync drift between local and server rules

## 5) Mitigations

1. Retries + CRC + status re-query
2. Guardrails around `0x41` in firmware and admin app
3. Atomic config writes and OTA rollback
4. Versioned config with conflict policy

## 6) Definition of Done

A feature is complete only when:

1. Contract docs are updated
2. Unit/integration tests pass
3. Hardware evidence is attached for EDGE changes
4. Rollback path is documented
