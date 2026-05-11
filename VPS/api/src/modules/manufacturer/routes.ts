import { Router } from "express";
import { z } from "zod";
import { collections } from "../../adapters/mongo/client.js";
import type { AuthJwtPayload } from "../../shared/auth.js";
import { requireRoles } from "../../shared/auth.js";
import { forbidden } from "../../shared/errors.js";
import { asyncHandler } from "../../shared/http.js";
import { parseBody, parseQuery } from "../../shared/validation.js";
import { isDeviceOnline, resolveManufacturerIdFromClaims } from "./service.js";

const manufacturerQuerySchema = z.object({
  manufacturer_id: z.string().min(1).optional()
});

const cabinetRegisterSchema = z.object({
  manufacturer_id: z.string().min(1).optional(),
  tenant_id: z.string().min(1).optional(),
  cabinet_id: z.string().min(1),
  cabinet_name: z.string().min(1),
  location_name: z.string().min(1).optional(),
  owner_id: z.string().min(1).optional(),
  total_lockers: z.number().int().positive().max(1000).default(24),
  mode: z.enum(["DEMO", "COMMERCIAL"]).default("DEMO"),
  access_modes: z.array(z.enum(["QR_MEMBER", "QR_CABINET", "WIEGAND", "FACE", "PAID_PUBLIC"])).default(["WIEGAND"])
});

const offlineThresholdSec = 180;

export const manufacturerRoutes = Router();

manufacturerRoutes.use(requireRoles(["manufacturer", "super_admin"]));

manufacturerRoutes.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const query = parseQuery(manufacturerQuerySchema, req.query);
    const manufacturerId = resolveManufacturerIdFromClaims(claims, query.manufacturer_id);

    const cabinetDocs = await collections()
      .cabinets.find<{ cabinet_id: string }>({ manufacturer_id: manufacturerId })
      .project({ _id: 0, cabinet_id: 1 })
      .toArray();

    const cabinetIds = cabinetDocs.map((c) => c.cabinet_id);
    const deviceDocs = cabinetIds.length
      ? await collections()
          .devices.find<{ cabinet_id: string; last_seen_at?: Date }>({ cabinet_id: { $in: cabinetIds } })
          .project({ _id: 0, cabinet_id: 1, last_seen_at: 1 })
          .toArray()
      : [];

    const nowMs = Date.now();
    const onlineCount = deviceDocs.filter((d) => isDeviceOnline(d.last_seen_at, nowMs, offlineThresholdSec)).length;
    const lastSeenEpoch = deviceDocs
      .map((d) => d.last_seen_at?.getTime() ?? 0)
      .reduce((max, cur) => Math.max(max, cur), 0);

    res.json({
      ok: true,
      manufacturer_id: manufacturerId,
      stats: {
        total_cabinets: cabinetIds.length,
        online_cabinets: onlineCount,
        offline_cabinets: Math.max(0, cabinetIds.length - onlineCount),
        last_seen_ts: Math.floor(lastSeenEpoch / 1000)
      }
    });
  })
);

manufacturerRoutes.get(
  "/cabinets",
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const query = parseQuery(manufacturerQuerySchema, req.query);
    const manufacturerId = resolveManufacturerIdFromClaims(claims, query.manufacturer_id);

    const cabinetDocs = await collections()
      .cabinets.find<{
        cabinet_id: string;
        cabinet_name?: string;
        location_name?: string;
        mode?: string;
        total_lockers?: number;
        owner_id?: string;
      }>({ manufacturer_id: manufacturerId })
      .project({ _id: 0, cabinet_id: 1, cabinet_name: 1, location_name: 1, mode: 1, total_lockers: 1, owner_id: 1 })
      .toArray();

    const cabinetIds = cabinetDocs.map((c) => c.cabinet_id);
    const deviceDocs = cabinetIds.length
      ? await collections()
          .devices.find<{ cabinet_id: string; device_id?: string; fw_version?: string; last_seen_at?: Date }>({
            cabinet_id: { $in: cabinetIds }
          })
          .project({ _id: 0, cabinet_id: 1, device_id: 1, fw_version: 1, last_seen_at: 1 })
          .toArray()
      : [];

    const deviceByCabinet = new Map(deviceDocs.map((d) => [d.cabinet_id, d]));
    const nowMs = Date.now();
    const items = cabinetDocs.map((cab) => {
      const device = deviceByCabinet.get(cab.cabinet_id);
      const online = isDeviceOnline(device?.last_seen_at, nowMs, offlineThresholdSec);
      return {
        cabinet_id: cab.cabinet_id,
        cabinet_name: cab.cabinet_name ?? cab.cabinet_id,
        location_name: cab.location_name ?? "",
        mode: cab.mode ?? "DEMO",
        total_lockers: cab.total_lockers ?? 0,
        owner_id: cab.owner_id ?? "",
        device_id: device?.device_id ?? "",
        firmware_version: device?.fw_version ?? "",
        last_seen_ts: device?.last_seen_at ? Math.floor(device.last_seen_at.getTime() / 1000) : 0,
        health_status: device ? (online ? "online" : "offline") : "never_seen"
      };
    });

    res.json({
      ok: true,
      manufacturer_id: manufacturerId,
      cabinets: items
    });
  })
);

manufacturerRoutes.post(
  "/cabinets/register",
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const body = parseBody(cabinetRegisterSchema, req.body);
    const manufacturerId = resolveManufacturerIdFromClaims(claims, body.manufacturer_id);
    const tenantId = claims.role === "super_admin" ? body.tenant_id ?? claims.tenant_id : claims.tenant_id;

    const existing = await collections().cabinets.findOne<{ manufacturer_id?: string }>({ cabinet_id: body.cabinet_id });
    if (existing?.manufacturer_id && existing.manufacturer_id !== manufacturerId) {
      throw forbidden("Cabinet is already assigned to another manufacturer");
    }

    await collections().cabinets.updateOne(
      { cabinet_id: body.cabinet_id },
      {
        $set: {
          cabinet_id: body.cabinet_id,
          cabinet_name: body.cabinet_name,
          location_name: body.location_name ?? "",
          manufacturer_id: manufacturerId,
          tenant_id: tenantId,
          owner_id: body.owner_id ?? "",
          total_lockers: body.total_lockers,
          mode: body.mode,
          access_modes: body.access_modes,
          status: "active",
          updated_at: new Date()
        },
        $setOnInsert: {
          created_at: new Date(),
          config_version: 1
        }
      },
      { upsert: true }
    );

    res.json({
      ok: true,
      manufacturer_id: manufacturerId,
      tenant_id: tenantId,
      cabinet_id: body.cabinet_id
    });
  })
);
