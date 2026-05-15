# Admin APK Execution Plan

Last updated: 2026-05-15  
Plan version: 1.0 (planning baseline)

## 1) Goal

Build a production-ready Admin Android APK for Smart Cabinet operations with:

1. Secure admin login.
2. BLE onboarding and cabinet provisioning.
3. User, rule, and drawer configuration workflows.
4. Clear sync and health visibility for field operators.

## 2) Scope for First APK Release (Admin MVP)

In scope:

1. Android app (React Native) for admin/operator role.
2. Firebase-based login flow and backend JWT session.
3. Cabinet selection context (`tenant_id`, `cabinet_id`).
4. CRUD-like admin workflows using current VPS endpoints (with planned API read/list additions).
5. BLE provisioning flow for device identity/bootstrap values.
6. Basic diagnostics panel (sync status, API status, firmware metadata).

Out of scope for this release:

1. Guest member app.
2. Face enrollment SDK integration inside APK.
3. Deep analytics and cloud reporting dashboard.
4. OTA binary upload from phone.

## Progress Snapshot (2026-05-15)

Implemented and verified in current APK build:

1. Manufacturer dashboard supports cabinet + owner wrap-up style flow with edit/delete/assign actions.
2. BLE device verify step locks Device ID/HW/FW fields after successful verification.
3. Validation highlighting added for invalid/missing BLE form fields.
4. MFGR Post-BLE flow now shows saved target cards and supports selection.
5. Device URL is user-controlled and stays fixed until MFGR manually changes it.
6. Local device discovery now includes local API probe (not only cloud/BLE scan).
7. In-app local page view added via WebView with top `Close` button to return to app flow.
8. Device Health refresh stabilized with short request timeout and reduced long-hang behavior.
9. Background live polling now avoids conflict with active local actions and in-app WebView view.

Security hygiene updates in this checkpoint:

1. Removed hardcoded admin owner password default from APK UI form state.
2. Removed hardcoded firmware AP password literal from source path in this diff and avoided AP password logging in serial output.

## 3) Current Backend Readiness (as of 2026-05-11)

Available:

1. `POST /v1/auth/mobile/google`
2. `POST /v1/admin/users`
3. `POST /v1/admin/rules`
4. `POST /v1/admin/drawers/map`
5. `GET /v1/public/apk/version?platform=android`
6. `POST /v1/admin/apk/releases`
7. EDGE LAN APIs for local operations and sync status.

Gaps before strong admin UX:

1. Missing admin list/read endpoints for users, rules, drawer mappings.
2. Missing explicit update/delete endpoints for admin entities.
3. No single admin endpoint to fetch complete cabinet config snapshot.
4. No audit-oriented admin operation history endpoint tailored for APK.

## 4) Required API Additions Before APK Build Sprint

Target additions to VPS API:

1. `GET /v1/admin/users?tenant_id=&cabinet_id=`
2. `GET /v1/admin/rules?tenant_id=&cabinet_id=`
3. `GET /v1/admin/drawers?tenant_id=&cabinet_id=`
4. `DELETE /v1/admin/users/:user_id`
5. `DELETE /v1/admin/rules/:rule_id`
6. `DELETE /v1/admin/drawers/:drawer_id?cabinet_id=`
7. `GET /v1/admin/cabinet/config?tenant_id=&cabinet_id=` (aggregated snapshot)

Optional but recommended:

1. Idempotent `PUT` endpoints for edit clarity.
2. Admin-side pagination/filter contract for scale.

## 5) App Architecture Baseline

Recommended baseline:

1. React Native CLI Android-first setup.
2. TypeScript strict mode.
3. State: lightweight store for session and active cabinet context.
4. Networking: typed API client with JWT interceptor and retry policy.
5. BLE module: isolated service layer with explicit command/response contract.
6. Validation: shared schema package for request payloads.

## 6) Screen Plan (Admin MVP)

1. Login screen (Google sign-in + backend token exchange).
2. Cabinet context screen (select/set tenant and cabinet).
3. Dashboard screen (VPS health, EDGE sync status, quick actions).
4. BLE provisioning screen (scan, connect, write bootstrap config).
5. Users screen (list/add/edit/remove user identity records).
6. Rules screen (list/add/edit/remove access rules).
7. Drawers screen (list/add/edit/remove drawer mappings).
8. APK version screen (view current latest release metadata).

## 7) Build Phases

### Phase A: Planning and Contract Freeze

1. Freeze Admin MVP scope.
2. Freeze API payload contracts and error format.
3. Freeze BLE provisioning payload keys and validation rules.

Exit criteria:

1. Contract document signed off.
2. API gap task list approved.

### Phase B: Backend Prep for APK

1. Add read/list/delete endpoints for admin entities.
2. Add aggregated cabinet config read endpoint.
3. Add integration tests for new admin endpoints.

Exit criteria:

1. Postman/cURL evidence for all admin endpoints.
2. Contract version bumped with migration notes.

### Phase C: APK Foundation

1. Initialize RN app shell and navigation.
2. Add auth session storage and route guards.
3. Add API client with standardized error handling.

Exit criteria:

1. Login and token persistence working.
2. Protected screens blocked without session.

### Phase D: Provisioning and Operations

1. Implement BLE onboarding flow.
2. Implement Users/Rules/Drawers screens wired to VPS.
3. Add validation and conflict-safe submission UX.

Exit criteria:

1. New cabinet setup via app without manual API calls.
2. Admin config changes reflected in EDGE sync cycle.

### Phase E: Stabilization and Release

1. Add smoke regression checklist.
2. Add crash and network-failure handling pass.
3. Generate signed release APK and publish metadata.

Exit criteria:

1. Pilot-ready APK build available.
2. Rollback and support notes documented.

## 8) Test Plan (APK Track)

1. Unit tests for API client, validation logic, and form mapping.
2. Integration tests for auth/session and key admin workflows.
3. Device tests on real Android hardware for BLE onboarding.
4. Field test with one live cabinet and VPS under normal and unstable network.

## 9) Risks and Mitigations

1. BLE fragmentation and unstable packet delivery.
2. API contract drift during parallel backend work.
3. Ambiguous admin permissions across tenant/cabinet.
4. Offline edits causing stale writes.

Mitigations:

1. BLE command ack/retry framing and timeout policy.
2. Shared schema package and contract version checks.
3. Explicit role/tenant/cabinet claims in JWT.
4. Optimistic UI with server-version confirmation on save.

## 10) Definition of Ready to Start APK Coding

1. Section 4 API additions are implemented and verified.
2. BLE provisioning payload contract is finalized.
3. Design wireframes for listed screens are approved.
4. Release signing and package naming decision is finalized.

## 11) Decision Gate

APK implementation starts only after:

1. This plan is reviewed and approved.
2. API readiness checklist is marked complete.
