# Smart Cabinet VPS API

Minimal backend for Smart Cabinet Phase 1:

1. credential-based auth (seeded users)
2. device registration
3. config sync
4. license checks
5. access log ingestion
6. OTA manifest delivery
7. admin config APIs
8. APK version tracking APIs

This implementation follows `docs/SYSTEM_CONTRACTS.md` (`0.1.5`).

## Stack

- Node.js + TypeScript + Express
- MongoDB (existing VPS deployment)
- Firebase Admin SDK (optional for notification/integrations)

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
pnpm run test
```

5. Mongo cutover dry-run / apply:

```bash
pnpm run mongo:cutover
pnpm run mongo:cutover -- --apply
```

Optional flags:

- `--drop-target-first` (dangerous, wipes target DB before copy)

Optional env overrides:

- `MONGO_SOURCE_DB` (default `smart_cabinet`)
- `MONGO_TARGET_DB` (default `smart_locker`)

6. Seed credential user (manufacturer/super admin/etc):

```bash
AUTH_SEED_EMAIL=mfr@example.com \
AUTH_SEED_PASSWORD='StrongPass#2026' \
AUTH_SEED_ROLE=manufacturer \
AUTH_SEED_DISPLAY_NAME='Demo Manufacturer' \
AUTH_SEED_TENANT_ID=tenant-001 \
pnpm run seed:auth-user
```

## Environment Variables

Required:

- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `JWT_SECRET`

Optional:

- `JWT_EXPIRES_IN` (default `12h`)
- `BCRYPT_ROUNDS` (default `10`)
- `ENABLE_GOOGLE_AUTH` (default `false`)
- `DEVICE_PROVISION_KEY` (server-side registration secret)
- `REQUIRE_DEVICE_PROVISION_KEY` (default `true`; keep `true` in production)
- `DEVICE_REGISTRATION_ALLOWLIST` (optional comma-separated `device_id` allowlist)
- `ALLOW_INSECURE_AUTH_BYPASS` (`true` only in local dev)
- `ALLOW_INSECURE_DEVICE_KEY_BYPASS` (`true` only in local dev)
- Firebase credentials (`GOOGLE_APPLICATION_CREDENTIALS` or inline env vars)

## API Surface

### Auth

- `POST /v1/auth/login`
- `GET /v1/auth/me`
- `POST /v1/auth/change-password`
- `POST /v1/auth/mobile/google` (disabled by default unless `ENABLE_GOOGLE_AUTH=true`)

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

### Manufacturer APIs (JWT, role=manufacturer|super_admin)

- `GET /v1/manufacturer/dashboard`
- `GET /v1/manufacturer/cabinets`
- `POST /v1/manufacturer/cabinets/register`

## Data Model (Mongo Collections)

- `auth_users`
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
5. Default DB name has been moved to `smart_locker`; use the cutover script for existing `smart_cabinet` data.

## Minimal cURL Flow

Login with seeded credentials:

```bash
curl -X POST http://localhost:8080/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier":"mfr@example.com",
    "password":"StrongPass#2026"
  }'
```

Register device:

```bash
curl -X POST http://localhost:8080/v1/device/register \
  -H "Content-Type: application/json" \
  -H "x-provision-key: <DEVICE_PROVISION_KEY>" \
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
