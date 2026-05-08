# Smart Cabinet VPS API

Minimal backend for Smart Cabinet Phase 1:

1. mobile auth
2. device registration
3. config sync
4. license checks
5. access log ingestion
6. OTA manifest delivery
7. admin config APIs
8. APK version tracking APIs

This implementation follows `docs/SYSTEM_CONTRACTS.md` (`0.1.0`).

## Stack

- Node.js + TypeScript + Express
- MongoDB (existing VPS deployment)
- Firebase Admin SDK (Google login token verification)

## Folder Layout

```text
VPS/api/
  src/
    app.ts
    server.ts
    config.ts
    adapters/
      mongo/
      firebase/
    modules/
      auth/
      sync/
      logs/
      license/
      ota/
      cabinet/
    shared/
```

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Run in dev mode:

```bash
pnpm run dev
```

4. Type-check / build:

```bash
pnpm run check
pnpm run build
```

## Environment Variables

Required:

- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `JWT_SECRET`

Optional:

- `DEVICE_PROVISION_KEY` (required header on first device provisioning)
- `ALLOW_INSECURE_AUTH_BYPASS` (`true` only in local dev)
- `ALLOW_INSECURE_DEVICE_KEY_BYPASS` (`true` only in local dev)
- Firebase credentials (`GOOGLE_APPLICATION_CREDENTIALS` or inline env vars)

## API Surface

### Mobile Auth

- `POST /v1/auth/mobile/google`
- Verifies Firebase ID token (or bypass in dev)
- Creates/updates user profile
- Returns backend JWT for admin endpoints

### Device APIs

- `POST /v1/device/register`
- `GET /v1/device/:id/config`
- `POST /v1/device/:id/logs/batch`
- `GET /v1/device/:id/license`
- `GET /v1/device/:id/ota/manifest`

Device protected endpoints require header:

- `x-device-key: <api_key>`

`api_key` is returned at first registration (or explicit rotation) and only hash is stored server-side.

### Admin APIs (JWT, role=admin)

- `POST /v1/admin/users`
- `POST /v1/admin/rules`
- `POST /v1/admin/drawers/map`
- `POST /v1/admin/apk/releases`

Admin protected endpoints require:

- `Authorization: Bearer <token>`

## Data Model (Mongo Collections)

- `devices`
- `cabinets`
- `users`
- `rules`
- `drawer_mappings`
- `access_logs`
- `licenses`
- `ota_releases`
- `mobile_sessions`
- `apk_releases`

Indexes are auto-created on startup (`src/adapters/mongo/indexes.ts`).

## Notes

1. EDGE remains offline-first for unlock decisions.
2. `config_version` increments when admin updates users/rules/drawer maps.
3. Logs endpoint accepts batches with duplicate-safe handling on `event_id`.
4. OTA endpoint returns the active channel manifest when newer and eligible.

## Minimal cURL Flow

Register device:

```bash
curl -X POST http://localhost:8080/v1/device/register \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"dev-001",
    "cabinet_id":"cab-001",
    "tenant_id":"tenant-001",
    "hw_model":"esp32-c3",
    "fw_version":"1.0.0"
  }'
```

Fetch config:

```bash
curl "http://localhost:8080/v1/device/dev-001/config" \
  -H "x-device-key: <api_key_from_register>"
```

Get latest APK version metadata:

```bash
curl "http://localhost:8080/v1/public/apk/version?platform=android"
```
