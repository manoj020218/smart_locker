import { Router } from "express";
import { z } from "zod";
import { verifyFirebaseIdToken } from "../../adapters/firebase/firebase_admin.js";
import { collections } from "../../adapters/mongo/client.js";
import { cfg } from "../../config.js";
import type { AuthJwtPayload } from "../../shared/auth.js";
import { requireAuthJwt, signAuthJwt, hashToken } from "../../shared/auth.js";
import { badRequest, forbidden, unauthorized } from "../../shared/errors.js";
import { asyncHandler } from "../../shared/http.js";
import { verifyPassword } from "../../shared/password.js";
import { parseBody } from "../../shared/validation.js";
import {
  authenticateCredentials,
  buildDashboardRoute,
  buildPermissions,
  markSuccessfulLogin,
  registerFcmTokenForUser,
  removeFcmTokenForUser,
  updatePasswordForUser
} from "./service.js";
import type { AuthUserDoc } from "./types.js";

const roleSchema = z.enum([
  "super_admin",
  "manufacturer",
  "owner",
  "cabinet_admin",
  "operator",
  "member",
  "admin",
  "agent",
  "customer"
]);

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(6)
});

const changePasswordSchema = z.object({
  current_password: z.string().min(6),
  new_password: z.string().min(8)
});

const fcmTokenSchema = z.object({
  token: z.string().min(20).max(4096)
});

const googleBodySchema = z.object({
  id_token: z.string().min(1).optional(),
  tenant_id: z.string().min(1).default("tenant-default"),
  cabinet_id: z.string().min(1).optional(),
  requested_role: roleSchema.optional(),
  email: z.string().email().optional(),
  name: z.string().min(1).optional()
});

const toAuthProfile = (user: Pick<AuthUserDoc, "user_id" | "display_name" | "email" | "mobile" | "role" | "tenant_id" | "status" | "manufacturer_id" | "owner_id" | "cabinet_ids" | "must_change_password">) => ({
  user_id: user.user_id,
  display_name: user.display_name,
  email: user.email ?? "",
  mobile: user.mobile ?? "",
  role: user.role,
  tenant_id: user.tenant_id,
  status: user.status,
  manufacturer_id: user.manufacturer_id ?? "",
  owner_id: user.owner_id ?? "",
  cabinet_ids: user.cabinet_ids ?? [],
  must_change_password: Boolean(user.must_change_password)
});

const buildClaims = (user: Pick<AuthUserDoc, "user_id" | "email" | "role" | "tenant_id" | "manufacturer_id" | "owner_id" | "cabinet_ids">): AuthJwtPayload => {
  const dashboardRoute = buildDashboardRoute(user.role);
  const permissions = buildPermissions(user.role);
  return {
    sub: user.user_id,
    user_id: user.user_id,
    email: user.email ?? "",
    role: user.role,
    tenant_id: user.tenant_id,
    manufacturer_id: user.manufacturer_id,
    owner_id: user.owner_id,
    cabinet_ids: user.cabinet_ids ?? [],
    permissions,
    dashboard_route: dashboardRoute
  };
};

export const authRoutes = Router();

authRoutes.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = parseBody(loginSchema, req.body);
    const user = await authenticateCredentials(collections().authUsers, body.identifier, body.password);
    await markSuccessfulLogin(collections().authUsers, user.user_id);

    const claims = buildClaims(user);
    const token = signAuthJwt(claims);
    await collections().mobileSessions.insertOne({
      uid: user.user_id,
      tenant_id: user.tenant_id,
      token_hash: hashToken(token),
      created_at: new Date()
    });

    res.json({
      ok: true,
      token,
      profile: toAuthProfile(user),
      allowed_permissions: claims.permissions ?? [],
      dashboard_route: claims.dashboard_route
    });
  })
);

authRoutes.get(
  "/me",
  requireAuthJwt,
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const userId = claims.user_id || claims.sub;
    const user = await collections().authUsers.findOne<AuthUserDoc>({ user_id: userId });
    if (!user) {
      throw unauthorized("User not found");
    }
    if (user.status !== "active") {
      throw forbidden("Account is not active");
    }

    const nextClaims = buildClaims(user);
    res.json({
      ok: true,
      profile: toAuthProfile(user),
      allowed_permissions: nextClaims.permissions ?? [],
      dashboard_route: nextClaims.dashboard_route
    });
  })
);

authRoutes.post(
  "/change-password",
  requireAuthJwt,
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const body = parseBody(changePasswordSchema, req.body);
    if (body.current_password === body.new_password) {
      throw badRequest("new_password must be different from current_password");
    }

    const userId = claims.user_id || claims.sub;
    const user = await collections().authUsers.findOne<AuthUserDoc>({ user_id: userId });
    if (!user) {
      throw unauthorized("User not found");
    }
    if (user.status !== "active") {
      throw forbidden("Account is not active");
    }

    const currentOk = await verifyPassword(body.current_password, user.password_hash);
    if (!currentOk) {
      throw unauthorized("Current password is invalid");
    }

    await updatePasswordForUser(collections().authUsers, user.user_id, body.new_password);
    res.json({ ok: true });
  })
);

authRoutes.post(
  "/register-fcm-token",
  requireAuthJwt,
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const body = parseBody(fcmTokenSchema, req.body);
    const userId = claims.user_id || claims.sub;
    const user = await collections().authUsers.findOne<AuthUserDoc>({ user_id: userId });
    if (!user) {
      throw unauthorized("User not found");
    }
    if (user.status !== "active") {
      throw forbidden("Account is not active");
    }

    await registerFcmTokenForUser(collections().authUsers, userId, body.token);
    res.json({ ok: true });
  })
);

authRoutes.post(
  "/remove-fcm-token",
  requireAuthJwt,
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const body = parseBody(fcmTokenSchema, req.body);
    const userId = claims.user_id || claims.sub;
    const user = await collections().authUsers.findOne<AuthUserDoc>({ user_id: userId });
    if (!user) {
      throw unauthorized("User not found");
    }
    if (user.status !== "active") {
      throw forbidden("Account is not active");
    }

    await removeFcmTokenForUser(collections().authUsers, userId, body.token);
    res.json({ ok: true });
  })
);

authRoutes.post(
  "/mobile/google",
  asyncHandler(async (req, res) => {
    if (!cfg.enableGoogleAuth) {
      throw forbidden("Google auth is disabled");
    }

    const body = parseBody(googleBodySchema, req.body);
    let email = "";
    let displayName = "";

    if (cfg.allowInsecureAuthBypass) {
      email = body.email ?? "dev-admin@local.test";
      displayName = body.name ?? "Dev Admin";
    } else {
      if (!body.id_token) {
        throw unauthorized("id_token is required");
      }
      const decoded = await verifyFirebaseIdToken(body.id_token);
      email = decoded.email ?? "";
      displayName = decoded.name ?? "Google User";
    }

    if (!email) {
      throw unauthorized("Email not available in token");
    }

    const emailLower = email.trim().toLowerCase();
    const existing = await collections().authUsers.findOne<AuthUserDoc>({ email_lower: emailLower });
    if (!existing) {
      throw forbidden("Google account is not pre-provisioned");
    }

    if (existing.status !== "active") {
      throw forbidden("Account is not active");
    }

    await collections().authUsers.updateOne(
      { user_id: existing.user_id },
      {
        $set: {
          display_name: displayName || existing.display_name,
          updated_at: new Date(),
          last_login_at: new Date()
        }
      }
    );

    const claims = buildClaims(existing);
    const token = signAuthJwt(claims);
    await collections().mobileSessions.insertOne({
      uid: existing.user_id,
      tenant_id: existing.tenant_id,
      token_hash: hashToken(token),
      created_at: new Date()
    });

    res.json({
      ok: true,
      token,
      profile: toAuthProfile(existing),
      allowed_permissions: claims.permissions ?? [],
      dashboard_route: claims.dashboard_route
    });
  })
);
