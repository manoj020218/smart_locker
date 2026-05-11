# APK Workspace

## Purpose

Mobile applications using React Native:

1. Admin app (Phase 1 priority)
2. Guest app (Phase 3)

## Admin App Responsibilities (Phase 1)

1. BLE onboarding of cabinet device
2. Manage users/cards/face IDs
3. Configure drawer mappings and rules
4. Trigger sync with VPS when online
5. Receive operational notifications via FCM

## Guest App Responsibilities (Phase 3)

1. Login via Google/Firebase
2. Generate secure access token
3. Transfer token over BLE to EDGE

## Package Strategy

- `packages/shared`: common UI/domain helpers
- `packages/protocol`: shared payload/validation models

## Immediate Build Targets

1. App shell and navigation
2. Firebase auth integration
3. BLE scan/connect/provision flow
4. Rule configuration forms

## Current Status (2026-05-11)

1. Admin app Phase-1 starter is now created in `APK/apps/admin`.
2. Credential login flow is implemented against `POST /v1/auth/login` (no Google auth dependency).
3. Manufacturer dashboard + cabinet register + owner create/assign demo screens are implemented.
4. See `APK/apps/admin/README.md` for run instructions and scope.

## Contract Reference

- `../docs/SYSTEM_CONTRACTS.md`
- `./docs/ADMIN_APK_EXECUTION_PLAN.md`
