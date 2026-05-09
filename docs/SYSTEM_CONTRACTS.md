# System Contracts

Last updated: 2026-05-09
Contract version: 0.1.3

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

LAN operator additions:

```json
{
  "ops_mode": {
    "method": "qr|wg_machine|qr_password|admin_emergency",
    "drawer_strategy": "fixed|random|reuse_last",
    "fixed_drawer_id": 0
  },
  "cabinet_meta": {
    "cabinet_id_2d": "01",
    "cabinet_name": "Main Lobby Locker",
    "cabinet_location": "Floor 1",
    "drawer_count": 24
  }
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

## 4A) EDGE Local Transaction Record (LAN PWA)

```json
{
  "seq": 101,
  "ts_epoch": 0,
  "time_hms": "143022",
  "cabinet_id_2d": "01",
  "board": 0,
  "lock": 5,
  "action": "open|close",
  "state_bit": 1,
  "user_ref": "13-52061",
  "user_hex_tail": "B",
  "protocol_code": "01143022B1"
}
```

`protocol_code` rule used by LAN export:

1. First 2 chars: cabinet ID (`cabinet_id_2d`)
2. Next 6 chars: `HHMMSS`
3. Last 2 chars: user hex tail + state bit (`1=open`, `0=close`)

Retention baseline:

1. Keep last 100 records in EDGE rolling buffer.
2. Older records require local CSV export from LAN PWA (cloud archival optional).

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

## 7A) Minimal EDGE LAN API Surface (PWA)

- `GET /api/health`
- `GET /api/cabinet/meta`
- `POST /api/cabinet/meta`
- `GET /api/ops/mode`
- `POST /api/ops/mode`
- `GET /api/wg/latest`
- `GET /api/wg/recent`
- `POST /api/rs485/open?board=<0..255>&lock=<0..255>`
- `GET /api/rs485/lock-status?board=<0..255>`
- `GET /api/rs485/ir-status?board=<0..255>`
- `GET /api/rs485/version?board=<0..255>`
- `GET /api/rs485/scan`
- `GET /api/tx/recent?limit=100`
- `GET /api/tx/download.csv?limit=100`

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

### 0.1.1 -> 0.1.2

Additive only (non-breaking):

1. Added LAN PWA transaction record contract and protocol code format.
2. Added operation mode and cabinet meta model for LAN operator workflows.
3. Added EDGE LAN transaction retrieval and CSV download endpoints.

### 0.1.2 -> 0.1.3

Additive only (non-breaking):

1. Added explicit cabinet meta and ops mode LAN API endpoints.
2. Added persistent storage requirement for cabinet meta and ops mode on EDGE NVS.
