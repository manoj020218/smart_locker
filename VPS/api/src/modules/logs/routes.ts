import { Router } from "express";
import { MongoBulkWriteError } from "mongodb";
import { z } from "zod";
import { collections } from "../../adapters/mongo/client.js";
import { requireDeviceKey } from "../../shared/auth.js";
import { badRequest } from "../../shared/errors.js";
import { asyncHandler } from "../../shared/http.js";
import { parseBody } from "../../shared/validation.js";

const logEventSchema = z.object({
  event_id: z.string().min(1),
  device_id: z.string().min(1),
  cabinet_id: z.string().min(1),
  ts: z.number().int().nonnegative(),
  channel: z.enum(["wiegand", "face", "ble_token"]),
  user_ref: z.string().min(1).optional().default(""),
  drawer_id: z.number().int().nonnegative(),
  result: z.enum(["open", "deny"]),
  reason: z.string().min(1),
  trace: z.record(z.unknown()).optional().default({})
});

const batchSchema = z.object({
  events: z.array(logEventSchema).min(1).max(500)
});

export const logsRoutes = Router();

logsRoutes.post(
  "/:id/logs/batch",
  requireDeviceKey,
  asyncHandler(async (req, res) => {
    const deviceId = req.params.id;
    const body = parseBody(batchSchema, req.body);

    const invalid = body.events.some((evt) => evt.device_id !== deviceId);
    if (invalid) throw badRequest("All events.device_id must match route device id");

    const docs = body.events.map((event) => ({
      ...event,
      received_at: new Date()
    }));

    try {
      const result = await collections().accessLogs.insertMany(docs, { ordered: false });
      res.json({
        ok: true,
        accepted: result.insertedCount,
        duplicates: 0
      });
    } catch (err) {
      if (err instanceof MongoBulkWriteError) {
        const writeErrors = Array.isArray(err.writeErrors) ? err.writeErrors : [err.writeErrors];
        const dupCount = writeErrors.filter((w: { code?: number }) => w.code === 11000).length;
        const accepted = docs.length - writeErrors.length;
        res.json({
          ok: true,
          accepted,
          duplicates: dupCount
        });
        return;
      }
      throw err;
    }
  })
);
