import type { AuthJwtPayload } from "../../shared/auth.js";
import { badRequest, forbidden } from "../../shared/errors.js";

export type HealthStatus = "online" | "offline" | "never_seen";

export const resolveManufacturerIdFromClaims = (
  claims: AuthJwtPayload,
  requestedManufacturerId?: string
): string => {
  if (claims.role === "super_admin") {
    const value = (requestedManufacturerId ?? "").trim();
    if (!value) {
      throw badRequest("manufacturer_id query is required for super_admin scope");
    }
    return value;
  }

  if (claims.role !== "manufacturer") {
    throw forbidden("Manufacturer role required");
  }

  const ownId = (claims.manufacturer_id ?? "").trim();
  if (!ownId) {
    throw forbidden("Manufacturer account is missing manufacturer_id");
  }

  if (requestedManufacturerId && requestedManufacturerId.trim() !== ownId) {
    throw forbidden("Cross-manufacturer scope is not allowed");
  }

  return ownId;
};

export const isDeviceOnline = (
  lastSeenAt: Date | null | undefined,
  nowMs: number,
  thresholdSec: number
): boolean => {
  if (!lastSeenAt) return false;
  const diffMs = nowMs - lastSeenAt.getTime();
  return diffMs >= 0 && diffMs <= thresholdSec * 1000;
};

export const resolveHealthStatus = (
  lastSeenAt: Date | null | undefined,
  nowMs: number,
  thresholdSec: number
): HealthStatus => {
  if (!lastSeenAt) return "never_seen";
  return isDeviceOnline(lastSeenAt, nowMs, thresholdSec) ? "online" : "offline";
};

export const parseEpochSec = (value: unknown, fieldName: string): number => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw badRequest(`${fieldName} must be a non-negative integer epoch seconds`);
  }
  return Math.floor(num);
};

export const isoDayFromEpochSec = (epochSec: number): string =>
  new Date(epochSec * 1000).toISOString().slice(0, 10);
