# VPS Workspace

## Purpose

Cloud layer for account, license, sync, logs, and OTA while EDGE remains offline-first for access control decisions.

## Implemented Backend

`VPS/api` contains a working Express + TypeScript backend using MongoDB and Firebase integration.

Implemented endpoints:

1. `POST /v1/auth/mobile/google`
2. `POST /v1/device/register`
3. `GET /v1/device/:id/config`
4. `POST /v1/device/:id/logs/batch`
5. `GET /v1/device/:id/license`
6. `GET /v1/device/:id/ota/manifest`
7. `POST /v1/admin/users`
8. `POST /v1/admin/rules`
9. `POST /v1/admin/drawers/map`
10. `GET /v1/public/apk/version`
11. `POST /v1/admin/apk/releases`

## Start Here

1. Read `VPS/api/README.md`
2. Copy `.env.example` to `.env`
3. Run:
   - `pnpm install`
   - `pnpm run dev`

## Contracts

All payloads align with `../docs/SYSTEM_CONTRACTS.md` (contract baseline `0.1.0`).
