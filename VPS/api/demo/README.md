# Manufacturer Demo Handover Pack

Last updated: 2026-05-11

This pack is for manufacturer-facing live demos and fast smoke validation.

## 1) What This Pack Covers

1. API health verification against live domain.
2. Manufacturer login + onboarding flow (cabinet + owner assignment).
3. Manufacturer confidence endpoints (`dashboard`, `cabinets`, `health`, `usage`, `owners`).
4. FCM token register/remove validation.
5. Repeatable flow via CLI script and Postman collection.

## 2) Live Demo Environment

1. API base URL: `https://smartlocker.iotsoft.in`
2. Demo manufacturer login:
   - Identifier: `mfr.demo.smarthub@iotsoft.in`
   - Password: `MfrDemo#2026`
3. VPS app: PM2 process `smart-locker-api` on port `8080` (behind Nginx).

## 3) Quick Health Check

PowerShell:

```powershell
curl.exe -s https://smartlocker.iotsoft.in/health
```

Linux:

```bash
curl -sS https://smartlocker.iotsoft.in/health
```

Expected response:

```json
{"ok":true,"service":"smart-cabinet-vps-api","ts":<epoch_sec>}
```

## 4) One-Command Smoke (Preferred)

Run from `VPS/api`:

PowerShell:

```powershell
.\scripts\smoke_manufacturer_demo.ps1 `
  -BaseUrl "https://smartlocker.iotsoft.in" `
  -Identifier "mfr.demo.smarthub@iotsoft.in" `
  -Password "MfrDemo#2026"
```

Linux:

```bash
./scripts/smoke_manufacturer_demo.sh \
  --base-url "https://smartlocker.iotsoft.in" \
  --identifier "mfr.demo.smarthub@iotsoft.in" \
  --password "MfrDemo#2026"
```

Expected final line:

```json
{"ok":true,"manufacturer_id":"...","cabinet_id":"...","owner_user_id":"..."}
```

## 5) Postman Demo Flow

1. Import collection:
   - `VPS/api/postman/manufacturer-demo.postman_collection.json`
2. Import environment:
   - `VPS/api/postman/manufacturer-demo.postman_environment.json`
3. Set environment values:
   - `baseUrl`
   - `identifier`
   - `password`
4. Run full collection in order (`1` to `13`).
5. Verify all requests are `2xx`.

## 6) Demo Safety Notes

1. Flow is isolated to Smart Locker API scope and does not require changes to other VPS services.
2. Cabinet/owner IDs are generated with timestamp/hash-friendly defaults to avoid collisions.
3. If an owner already exists with same email/mobile, API returns `400` (expected protective behavior).

## 7) Troubleshooting

1. `401 invalid credentials`:
   - Verify seeded identifier/password.
2. `403 cross-manufacturer scope`:
   - Ensure JWT belongs to manufacturer user.
3. `500 on owner create`:
   - Check PM2 logs: `pm2 logs smart-locker-api --lines 100 --nostream`
4. Health fails:
   - Check PM2: `pm2 list`
   - Check port owner: `ss -ltnp | grep ':8080'`

## 8) Files in This Pack

1. `VPS/api/demo/README.md`
2. `VPS/api/postman/manufacturer-demo.postman_collection.json`
3. `VPS/api/postman/manufacturer-demo.postman_environment.json`
4. `VPS/api/scripts/smoke_manufacturer_demo.ts`
5. `VPS/api/scripts/smoke_manufacturer_demo.ps1`
6. `VPS/api/scripts/smoke_manufacturer_demo.sh`
