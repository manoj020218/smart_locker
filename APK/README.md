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

## Contract Reference

- `../docs/SYSTEM_CONTRACTS.md`
