# System Contracts

Last updated: 2026-05-07
Contract version: 0.1.1

## 1) Contract Principles

1. EDGE is source of truth for real-time unlock decisions.
2. VPS is source of truth for account, license, fleet-level administration.
3. Sync is eventual consistency with versioned payloads.
4. Any breaking change increments contract version.

## 2) Device Identity

Required per device:

- `device_id` (globally unique)
- `cabinet_id`
- `tenant_id`
- `hw_model`
- `fw_version`

## 3) EDGE Local Models

```json
{
  "drawers": [{"drawer_id": 1, "board_address": 1, "lock_address": 0}],
  "users": [{"user_id": "u1", "card_id": "C123", "face_id": "F123"}],
  "rules": [{"rule_id": "r1", "user_id": "u1", "drawer_id": 1, "valid_from": 0, "valid_to": 0, "cooldown_sec": 28800, "payment_required": true}],
  "license": {"state": "active", "valid_to": 0},
  "sync": {"config_version": 1, "last_sync_ts": 0}
}
```

## 4) EDGE -> VPS Log Event

```json
{
  "event_id": "uuid",
  "device_id": "dev-001",
  "cabinet_id": "cab-001",
  "ts": 0,
  "channel": "wiegand|face|ble_token",
  "user_ref": "u1",
  "drawer_id": 1,
  "result": "open|deny",
  "reason": "rule_ok|expired|cooldown|license_block|unknown_user",
  "trace": {"board": 1, "lock": 0, "cmd": "0x50", "latency_ms": 42}
}
```

## 5) VPS -> EDGE Config Sync

```json
{
  "config_version": 12,
  "license": {"state": "active", "valid_to": 0},
  "drawers": [],
  "users": [],
  "rules": [],
  "policy": {
    "clock_skew_sec": 60,
    "log_flush_interval_sec": 30,
    "deny_when_license_expired": false
  }
}
```

## 6) OTA Manifest Contract

```json
{
  "channel": "stable",
  "version": "1.0.5",
  "min_from": "1.0.0",
  "url": "https://.../firmware.bin",
  "sha256": "hex",
  "size": 0,
  "signed_at": 0,
  "signature": "base64"
}
```

## 6A) APK Version Contract (Public)

```json
{
  "platform": "android",
  "version": "1.0.5",
  "build": 12,
  "url": "https://example.com/smart-locker.apk",
  "release_notes": "Stability fixes",
  "mandatory": false,
  "min_supported_build": 8,
  "checksum_sha256": "hex",
  "released_at": "2026-05-07"
}
```

## 7) Minimal API Surface (VPS)

- `POST /v1/auth/mobile/google`
- `POST /v1/device/register`
- `GET /v1/device/:id/config`
- `POST /v1/device/:id/logs/batch`
- `GET /v1/device/:id/license`
- `GET /v1/device/:id/ota/manifest`
- `POST /v1/admin/users`
- `POST /v1/admin/rules`
- `POST /v1/admin/drawers/map`
- `GET /v1/public/apk/version?platform=android`
- `POST /v1/admin/apk/releases`

## 8) Security Baseline

1. TLS everywhere outside BLE/RS485 local buses
2. Signed OTA manifest and binary checksum verification
3. Firebase Google ID token verification on VPS
4. Device API key or signed JWT per device
5. Replay protection for Guest token channel

## 9) Versioning Policy

- Non-breaking additive change: patch increment
- Breaking payload or endpoint change: major increment
- Every contract update must include migration notes

## 10) Migration Notes

### 0.1.0 -> 0.1.1

Additive only (non-breaking):

1. Added public APK version endpoint for mobile update checks.
2. Added admin APK release publish endpoint for version tracking metadata.
