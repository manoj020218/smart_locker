import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { createHash, timingSafeEqual } from "node:crypto";
import { cfg } from "../config.js";
import { collections } from "../adapters/mongo/client.js";
import { forbidden, unauthorized } from "./errors.js";

export type AuthRole =
  | "super_admin"
  | "manufacturer"
  | "owner"
  | "cabinet_admin"
  | "operator"
  | "member"
  | "admin"
  | "agent"
  | "customer";

type LegacyJwtPayload = {
  uid: string;
  email: string;
  role: "admin" | "agent" | "customer";
  tenant_id: string;
};

export type AuthJwtPayload = {
  sub: string;
  user_id: string;
  email: string;
  role: AuthRole;
  tenant_id: string;
  manufacturer_id?: string;
  owner_id?: string;
  cabinet_ids?: string[];
  permissions?: string[];
  dashboard_route?: string;
};

export const hashToken = (value: string): string => createHash("sha256").update(value).digest("hex");

export const signAuthJwt = (payload: AuthJwtPayload): string =>
  jwt.sign(payload, cfg.jwtSecret, {
    algorithm: "HS256",
    expiresIn: cfg.jwtExpiresIn as jwt.SignOptions["expiresIn"]
  });

export const signMobileJwt = (payload: LegacyJwtPayload): string =>
  signAuthJwt({
    sub: payload.uid,
    user_id: payload.uid,
    email: payload.email,
    role: payload.role,
    tenant_id: payload.tenant_id
  });

export const verifyAuthJwt = (token: string): AuthJwtPayload => {
  const decoded = jwt.verify(token, cfg.jwtSecret) as Record<string, unknown>;
  if (typeof decoded.uid === "string" && typeof decoded.role === "string") {
    return {
      sub: decoded.uid,
      user_id: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : "",
      role: decoded.role as AuthRole,
      tenant_id: typeof decoded.tenant_id === "string" ? decoded.tenant_id : "tenant-default"
    };
  }

  return {
    sub: typeof decoded.sub === "string" ? decoded.sub : "",
    user_id: typeof decoded.user_id === "string" ? decoded.user_id : "",
    email: typeof decoded.email === "string" ? decoded.email : "",
    role: decoded.role as AuthRole,
    tenant_id: typeof decoded.tenant_id === "string" ? decoded.tenant_id : "tenant-default",
    manufacturer_id: typeof decoded.manufacturer_id === "string" ? decoded.manufacturer_id : undefined,
    owner_id: typeof decoded.owner_id === "string" ? decoded.owner_id : undefined,
    cabinet_ids: Array.isArray(decoded.cabinet_ids) ? (decoded.cabinet_ids as string[]) : undefined,
    permissions: Array.isArray(decoded.permissions) ? (decoded.permissions as string[]) : undefined,
    dashboard_route: typeof decoded.dashboard_route === "string" ? decoded.dashboard_route : undefined
  };
};

export const verifyMobileJwt = (token: string): LegacyJwtPayload => {
  const claims = verifyAuthJwt(token);
  return {
    uid: claims.user_id || claims.sub,
    email: claims.email,
    role: (claims.role === "admin" || claims.role === "agent" || claims.role === "customer" ? claims.role : "admin"),
    tenant_id: claims.tenant_id
  };
};

export const requireAuthJwt = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.header("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    next(unauthorized("Missing bearer token"));
    return;
  }

  try {
    const claims = verifyAuthJwt(token);
    if (!claims.user_id && !claims.sub) {
      next(unauthorized("Invalid bearer token"));
      return;
    }
    (req as Request & { user: AuthJwtPayload }).user = claims;
    next();
  } catch {
    next(unauthorized("Invalid bearer token"));
  }
};

export const requireRoles =
  (allowedRoles: AuthRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    requireAuthJwt(req, _res, (err?: unknown) => {
      if (err) {
        next(err as Error);
        return;
      }

      const claims = (req as Request & { user?: AuthJwtPayload }).user;
      if (!claims || !allowedRoles.includes(claims.role)) {
        next(forbidden("Insufficient role permissions"));
        return;
      }
      next();
    });
  };

export const requireAdminJwt = requireRoles(["admin", "cabinet_admin", "super_admin", "manufacturer"]);

const safeEqualHex = (aHex: string, bHex: string): boolean => {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

export const requireDeviceKey = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  if (cfg.allowInsecureDeviceKeyBypass) {
    (req as Request & { device_auth_bypass: boolean }).device_auth_bypass = true;
    next();
    return;
  }

  const deviceId = req.params.id;
  const provided = req.header("x-device-key");
  if (!deviceId || !provided) {
    next(unauthorized("Missing x-device-key or device id"));
    return;
  }

  const device = await collections().devices.findOne<{ device_id: string; api_key_hash?: string }>({
    device_id: deviceId
  });
  if (!device?.api_key_hash) {
    next(unauthorized("Device is not provisioned"));
    return;
  }

  const providedHash = hashToken(provided);
  if (!safeEqualHex(providedHash, device.api_key_hash)) {
    next(unauthorized("Invalid x-device-key"));
    return;
  }

  (req as Request & { device_id: string }).device_id = deviceId;
  next();
};
