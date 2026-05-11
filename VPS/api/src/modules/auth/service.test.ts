import test from "node:test";
import assert from "node:assert/strict";
import type { AuthUserDoc } from "./types.js";
import {
  authenticateCredentials,
  buildDashboardRoute,
  buildPermissions,
  markSuccessfulLogin,
  updatePasswordForUser
} from "./service.js";
import { hashPassword, verifyPassword } from "../../shared/password.js";

type FakeAuthCollection = {
  findOne: (query: Record<string, unknown>) => Promise<(AuthUserDoc & { _id: string }) | null>;
  updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<void>;
};

const makeUser = async (overrides: Partial<AuthUserDoc> = {}): Promise<AuthUserDoc & { _id: string }> => ({
  _id: "id-1",
  user_id: "manufacturer-001",
  display_name: "Manufacturer One",
  email: "mfr@example.com",
  email_lower: "mfr@example.com",
  mobile: "9999999999",
  password_hash: await hashPassword("Secret@123"),
  role: "manufacturer",
  status: "active",
  tenant_id: "tenant-001",
  cabinet_ids: ["cab-01"],
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides
});

const makeCollection = (users: Array<AuthUserDoc & { _id: string }>): FakeAuthCollection => ({
  async findOne(query: Record<string, unknown>) {
    if (typeof query.email_lower === "string") {
      return users.find((u) => u.email_lower === query.email_lower) ?? null;
    }
    if (typeof query.mobile === "string") {
      return users.find((u) => u.mobile === query.mobile) ?? null;
    }
    if (typeof query.user_id === "string") {
      return users.find((u) => u.user_id === query.user_id) ?? null;
    }
    return null;
  },
  async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
    const user = await this.findOne(filter);
    if (!user) return;
    const set = (update.$set as Record<string, unknown>) ?? {};
    Object.assign(user, set);
  }
});

test("authenticateCredentials succeeds for active user with valid password", async () => {
  const users = [await makeUser()];
  const coll = makeCollection(users);
  const user = await authenticateCredentials(coll as never, "MFR@example.com", "Secret@123");
  assert.equal(user.user_id, "manufacturer-001");
});

test("authenticateCredentials fails for wrong password", async () => {
  const users = [await makeUser()];
  const coll = makeCollection(users);
  await assert.rejects(async () => authenticateCredentials(coll as never, "mfr@example.com", "wrong"));
});

test("authenticateCredentials fails for blocked user", async () => {
  const users = [await makeUser({ status: "blocked" })];
  const coll = makeCollection(users);
  await assert.rejects(async () => authenticateCredentials(coll as never, "mfr@example.com", "Secret@123"));
});

test("markSuccessfulLogin writes last_login_at", async () => {
  const users = [await makeUser()];
  const coll = makeCollection(users);
  assert.equal(users[0].last_login_at, undefined);
  await markSuccessfulLogin(coll as never, users[0].user_id);
  assert.ok(Boolean(users[0].last_login_at));
});

test("updatePasswordForUser changes hash and old password no longer works", async () => {
  const users = [await makeUser()];
  const coll = makeCollection(users);
  const oldHash = users[0].password_hash;
  await updatePasswordForUser(coll as never, users[0].user_id, "Secret@456");
  assert.notEqual(users[0].password_hash, oldHash);
  assert.equal(await verifyPassword("Secret@456", users[0].password_hash), true);
  assert.equal(await verifyPassword("Secret@123", users[0].password_hash), false);
});

test("role mapping returns expected dashboard and permissions", () => {
  assert.equal(buildDashboardRoute("super_admin"), "/super");
  assert.equal(buildDashboardRoute("manufacturer"), "/manufacturer");
  assert.ok(buildPermissions("manufacturer").includes("cabinet.register"));
  assert.ok(buildPermissions("member").includes("member.qr.read"));
});
