import { Router } from "express";
import { collections } from "../../adapters/mongo/client.js";
import { requireDeviceKey } from "../../shared/auth.js";
import { notFound } from "../../shared/errors.js";
import { asyncHandler } from "../../shared/http.js";

export const licenseRoutes = Router();

licenseRoutes.get(
  "/:id/license",
  requireDeviceKey,
  asyncHandler(async (req, res) => {
    const deviceId = req.params.id;
    const [device, license] = await Promise.all([
      collections().devices.findOne<{ cabinet_id: string; tenant_id: string }>({ device_id: deviceId }),
      collections().licenses.findOne<{ state?: string; valid_to?: number }>({ device_id: deviceId })
    ]);

    if (!device) throw notFound("Device not registered");

    res.json({
      ok: true,
      device_id: deviceId,
      cabinet_id: device.cabinet_id,
      tenant_id: device.tenant_id,
      license: {
        state: license?.state ?? "active",
        valid_to: license?.valid_to ?? 0
      }
    });
  })
);
