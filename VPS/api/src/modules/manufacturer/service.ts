import type { AuthJwtPayload } from "../../shared/auth.js";
import { badRequest, forbidden } from "../../shared/errors.js";

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
