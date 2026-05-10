import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { collections } from "../../adapters/mongo/client.js";
import { cfg } from "../../config.js";
import { hashToken, requireDeviceKey } from "../../shared/auth.js";
import { badRequest, forbidden, notFound } from "../../shared/errors.js";
import { asyncHandler } from "../../shared/http.js";
import { parseBody } from "../../shared/validation.js";

const registerSchema = z.object({
  device_id: z.string().min(1),
  cabinet_id: z.string().min(1),
  tenant_id: z.string().min(1),
  hw_model: z.string().min(1),
  fw_version: z.string().min(1),
  rotate_key: z.boolean().optional().default(false)
});

const nowSec = (): number => Math.floor(Date.now() / 1000);

export const syncRoutes = Router();

syncRoutes.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = parseBody(registerSchema, req.body);

    if (cfg.deviceRegistrationAllowlist.length > 0 && !cfg.deviceRegistrationAllowlist.includes(body.device_id)) {
      throw forbidden("Device is not allowlisted for registration");
    }

    if (cfg.requireDeviceProvisionKey && !cfg.allowInsecureDeviceKeyBypass) {
      if (!cfg.deviceProvisionKey) {
        throw forbidden("Device registration is locked: server provision key is not configured");
      }
      const given = req.header("x-provision-key") ?? "";
      if (!given || given !== cfg.deviceProvisionKey) {
        throw forbidden("Invalid or missing x-provision-key");
      }
    }

    const c = collections();
    const existing = await c.devices.findOne<{ api_key_hash?: string; cabinet_id?: string; tenant_id?: string }>({
      device_id: body.device_id
    });

    if (
      existing &&
      ((existing.cabinet_id && existing.cabinet_id !== body.cabinet_id) || (existing.tenant_id && existing.tenant_id !== body.tenant_id))
    ) {
      throw forbidden("Device identity mismatch for cabinet or tenant");
    }

    let apiKey: string | null = null;
    if (!existing?.api_key_hash || body.rotate_key) {
      apiKey = randomBytes(24).toString("hex");
    }

    await c.devices.updateOne(
      { device_id: body.device_id },
      {
        $set: {
          device_id: body.device_id,
          cabinet_id: body.cabinet_id,
          tenant_id: body.tenant_id,
          hw_model: body.hw_model,
          fw_version: body.fw_version,
          last_seen_at: new Date(),
          updated_at: new Date(),
          ...(apiKey ? { api_key_hash: hashToken(apiKey) } : {})
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    await c.cabinets.updateOne(
      { cabinet_id: body.cabinet_id },
      {
        $setOnInsert: {
          cabinet_id: body.cabinet_id,
          tenant_id: body.tenant_id,
          config_version: 1,
          created_at: new Date()
        },
        $set: {
          updated_at: new Date()
        }
      },
      { upsert: true }
    );

    await c.licenses.updateOne(
      { device_id: body.device_id },
      {
        $setOnInsert: {
          device_id: body.device_id,
          cabinet_id: body.cabinet_id,
          tenant_id: body.tenant_id,
          state: "active",
          valid_to: nowSec() + 60 * 60 * 24 * 30,
          created_at: new Date()
        },
        $set: {
          updated_at: new Date()
        }
      },
      { upsert: true }
    );

    res.json({
      ok: true,
      device_id: body.device_id,
      cabinet_id: body.cabinet_id,
      tenant_id: body.tenant_id,
      api_key: apiKey,
      note: apiKey
        ? "Store api_key securely in EDGE NVS. It is only returned on first registration/rotation."
        : "api_key unchanged",
      ts: nowSec()
    });
  })
);

syncRoutes.get(
  "/:id/config",
  requireDeviceKey,
  asyncHandler(async (req, res) => {
    const deviceId = req.params.id;
    if (!deviceId) throw badRequest("Missing device id");

    const c = collections();
    const device = await c.devices.findOne<{
      device_id: string;
      cabinet_id: string;
      tenant_id: string;
      fw_version: string;
    }>({ device_id: deviceId });
    if (!device) throw notFound("Device not registered");

    await c.devices.updateOne(
      { device_id: deviceId },
      { $set: { last_seen_at: new Date() } }
    );

    const [cabinet, license, drawers, users, rules] = await Promise.all([
      c.cabinets.findOne<{ config_version?: number }>({ cabinet_id: device.cabinet_id }),
      c.licenses.findOne<{ state?: string; valid_to?: number }>({ device_id: deviceId }),
      c.drawerMappings.find({ cabinet_id: device.cabinet_id }).project({ _id: 0, created_at: 0, updated_at: 0 }).toArray(),
      c.users
        .find({ tenant_id: device.tenant_id, cabinet_id: device.cabinet_id })
        .project({ _id: 0, auth_uid: 0, created_at: 0, updated_at: 0 })
        .toArray(),
      c.rules.find({ tenant_id: device.tenant_id, cabinet_id: device.cabinet_id }).project({ _id: 0, created_at: 0, updated_at: 0 }).toArray()
    ]);

    res.json({
      config_version: cabinet?.config_version ?? 1,
      license: {
        state: license?.state ?? "active",
        valid_to: license?.valid_to ?? 0
      },
      drawers,
      users,
      rules,
      policy: {
        clock_skew_sec: 60,
        log_flush_interval_sec: 30,
        deny_when_license_expired: false
      }
    });
  })
);
