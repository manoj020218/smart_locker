import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { createHash, timingSafeEqual } from "node:crypto";
import { cfg } from "../config.js";
import { collections } from "../adapters/mongo/client.js";
import { forbidden, unauthorized } from "./errors.js";

type JwtPayload = {
  uid: string;
  email: string;
  role: "admin" | "agent" | "customer";
  tenant_id: string;
};

export const hashToken = (value: string): string => createHash("sha256").update(value).digest("hex");

export const signMobileJwt = (payload: JwtPayload): string =>
  jwt.sign(payload, cfg.jwtSecret, { algorithm: "HS256", expiresIn: "12h" });

export const verifyMobileJwt = (token: string): JwtPayload =>
  jwt.verify(token, cfg.jwtSecret) as JwtPayload;

export const requireAdminJwt = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.header("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    next(unauthorized("Missing bearer token"));
    return;
  }

  try {
    const claims = verifyMobileJwt(token);
    if (claims.role !== "admin") {
      next(forbidden("Admin role required"));
      return;
    }
    (req as Request & { user: JwtPayload }).user = claims;
    next();
  } catch {
    next(unauthorized("Invalid bearer token"));
  }
};

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
