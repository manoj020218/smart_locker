# Smart Cabinet Admin App (Phase 1 Starter)

Last updated: 2026-05-11

This is the fast-delivery Admin APK starter focused on manufacturer onboarding confidence.

## 1) Current Scope Implemented

1. Credential login (`/v1/auth/login`) with saved session.
2. Manufacturer dashboard live fetch.
3. Cabinet registration form (`/v1/manufacturer/cabinets/register`).
4. Owner creation and optional assignment to cabinet:
   - `POST /v1/manufacturer/owners`
   - `POST /v1/manufacturer/cabinets/:cabinetId/assign-owner`
5. Owners + cabinets quick list panels for field demo.

## 2) Tech Baseline

1. React Native with Expo-managed Android-first setup.
2. TypeScript strict mode.
3. Token/session persistence with AsyncStorage.

## 3) Local Run

```bash
cd APK/apps/admin
npm install
npm run start
```

Android run (requires local Android tooling):

```bash
npm run android
```

## 4) Default Demo Login

1. Base URL: `https://smartlocker.iotsoft.in`
2. Identifier: `mfr.demo.smarthub@iotsoft.in`
3. Password: `MfrDemo#2026`

## 5) Immediate Next Phase (already planned)

1. Add users/rules/drawer admin screens once corresponding read/list/delete APIs are finalized.
2. Add BLE provisioning screen module.
3. Add role-based guards and audit trail views.
