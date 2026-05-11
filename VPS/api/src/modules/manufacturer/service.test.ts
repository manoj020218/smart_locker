import test from "node:test";
import assert from "node:assert/strict";
import type { AuthJwtPayload } from "../../shared/auth.js";
import { isDeviceOnline, resolveManufacturerIdFromClaims } from "./service.js";

const baseManufacturerClaims: AuthJwtPayload = {
  sub: "usr-1",
  user_id: "usr-1",
  email: "mfr@example.com",
  role: "manufacturer",
  tenant_id: "tenant-001",
  manufacturer_id: "mfr-001",
  cabinet_ids: []
};

test("resolveManufacturerIdFromClaims returns own manufacturer id", () => {
  assert.equal(resolveManufacturerIdFromClaims(baseManufacturerClaims), "mfr-001");
  assert.equal(resolveManufacturerIdFromClaims(baseManufacturerClaims, "mfr-001"), "mfr-001");
});

test("resolveManufacturerIdFromClaims rejects cross-manufacturer query", () => {
  assert.throws(() => resolveManufacturerIdFromClaims(baseManufacturerClaims, "mfr-xyz"));
});

test("resolveManufacturerIdFromClaims requires query for super admin", () => {
  const superClaims: AuthJwtPayload = { ...baseManufacturerClaims, role: "super_admin" };
  assert.throws(() => resolveManufacturerIdFromClaims(superClaims));
  assert.equal(resolveManufacturerIdFromClaims(superClaims, "mfr-002"), "mfr-002");
});

test("isDeviceOnline evaluates heartbeat window", () => {
  const now = Date.now();
  assert.equal(isDeviceOnline(new Date(now - 60_000), now, 180), true);
  assert.equal(isDeviceOnline(new Date(now - 400_000), now, 180), false);
  assert.equal(isDeviceOnline(undefined, now, 180), false);
});
