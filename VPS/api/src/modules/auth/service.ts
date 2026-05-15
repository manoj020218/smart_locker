import type { Collection, Filter, UpdateFilter, WithId } from "mongodb";
import { createHash } from "node:crypto";
import type { AuthRole } from "../../shared/auth.js";
import { forbidden, unauthorized } from "../../shared/errors.js";
import { hashPassword, verifyPassword } from "../../shared/password.js";
import type { AuthUserDoc } from "./types.js";

type AuthUsersCollection = Pick<
  Collection<AuthUserDoc>,
  "findOne" | "updateOne"
>;

export const normalizeLoginIdentifier = (identifier: string): string => identifier.trim().toLowerCase();

export const isEmailIdentifier = (identifier: string): boolean => identifier.includes("@");

export const findAuthUserByIdentifier = async (
  authUsers: AuthUsersCollection,
  identifier: string
): Promise<WithId<AuthUserDoc> | null> => {
  const normalized = normalizeLoginIdentifier(identifier);
  const query: Filter<AuthUserDoc> = isEmailIdentifier(normalized)
    ? { email_lower: normalized }
    : { mobile: identifier.trim() };
  return authUsers.findOne(query);
};

export const ensureActiveAuthUser = (user: Pick<AuthUserDoc, "status">): void => {
  if (user.status !== "active") {
    throw forbidden("Account is not active");
  }
};

export const verifyAuthUserPassword = async (
  user: Pick<AuthUserDoc, "password_hash">,
  plainPassword: string
): Promise<void> => {
  const ok = await verifyPassword(plainPassword, user.password_hash);
  if (!ok) {
    throw unauthorized("Invalid credentials");
  }
};

export const buildDashboardRoute = (role: AuthRole): string => {
  switch (role) {
    case "super_admin":
      return "/super";
    case "manufacturer":
      return "/manufacturer";
    case "owner":
      return "/owner";
    case "cabinet_admin":
    case "admin":
      return "/admin";
    case "operator":
    case "agent":
      return "/operator";
    case "member":
    case "customer":
      return "/member";
    default:
      return "/dashboard";
  }
};

export const buildPermissions = (role: AuthRole): string[] => {
  switch (role) {
    case "super_admin":
      return [
        "platform.manage",
        "manufacturer.create",
        "manufacturer.status.update",
        "credits.adjust",
        "audit.read"
      ];
    case "manufacturer":
      return [
        "manufacturer.dashboard.read",
        "cabinet.register",
        "cabinet.assign_owner",
        "owner.create",
        "manufacturer.health.read",
        "member.manage",
        "rule.manage",
        "drawer.manage",
        "operation.read"
      ];
    case "owner":
      return [
        "owner.dashboard.read",
        "owner.wallet.read",
        "owner.user.manage",
        "owner.report.read"
      ];
    case "cabinet_admin":
    case "admin":
      return [
        "member.manage",
        "rule.manage",
        "drawer.manage",
        "operation.read"
      ];
    case "operator":
    case "agent":
      return [
        "cabinet.status.read",
        "operation.today.read",
        "manual_open.request"
      ];
    case "member":
    case "customer":
      return [
        "member.qr.read",
        "member.history.read"
      ];
    default:
      return [];
  }
};

export const authenticateCredentials = async (
  authUsers: AuthUsersCollection,
  identifier: string,
  password: string
): Promise<WithId<AuthUserDoc>> => {
  const user = await findAuthUserByIdentifier(authUsers, identifier);
  if (!user) {
    throw unauthorized("Invalid credentials");
  }
  ensureActiveAuthUser(user);
  await verifyAuthUserPassword(user, password);
  return user;
};

export const markSuccessfulLogin = async (
  authUsers: AuthUsersCollection,
  userId: string
): Promise<void> => {
  await authUsers.updateOne({ user_id: userId }, { $set: { last_login_at: new Date(), updated_at: new Date() } });
};

export const updatePasswordForUser = async (
  authUsers: AuthUsersCollection,
  userId: string,
  nextPassword: string
): Promise<void> => {
  const hashed = await hashPassword(nextPassword);
  const update: UpdateFilter<AuthUserDoc> = {
    $set: {
      password_hash: hashed,
      must_change_password: false,
      updated_at: new Date()
    }
  };
  await authUsers.updateOne({ user_id: userId }, update);
};

export const registerFcmTokenForUser = async (
  authUsers: AuthUsersCollection,
  userId: string,
  token: string
): Promise<void> => {
  await authUsers.updateOne(
    { user_id: userId },
    {
      $addToSet: { fcm_tokens: token },
      $set: { updated_at: new Date() }
    }
  );
};

export const removeFcmTokenForUser = async (
  authUsers: AuthUsersCollection,
  userId: string,
  token: string
): Promise<void> => {
  await authUsers.updateOne(
    { user_id: userId },
    {
      $pull: { fcm_tokens: token },
      $set: { updated_at: new Date() }
    }
  );
};

export const buildSeedUserId = (role: AuthRole, emailOrMobile: string): string => {
  const prefix = role.replace(/[^a-z]/g, "").slice(0, 6) || "user";
  const normalized = emailOrMobile.trim().toLowerCase();
  const stemRaw = normalized.replace(/[^a-z0-9]/g, "");
  const stem = (stemRaw.slice(0, 4) || "user").padEnd(4, "0");
  const digest = createHash("sha1").update(normalized).digest("hex").slice(0, 8);
  return `${prefix}-${stem}${digest}`;
};
