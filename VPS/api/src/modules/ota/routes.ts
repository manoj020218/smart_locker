import { Router } from "express";
import { z } from "zod";
import { collections } from "../../adapters/mongo/client.js";
import { requireDeviceKey } from "../../shared/auth.js";
import { asyncHandler } from "../../shared/http.js";
import { parseQuery } from "../../shared/validation.js";

const querySchema = z.object({
  channel: z.string().min(1).default("stable")
});

const toParts = (v: string): number[] =>
  v
    .split(".")
    .map((p) => Number(p))
    .map((n) => (Number.isFinite(n) ? n : 0));

const versionGte = (a: string, b: string): boolean => {
  const ap = toParts(a);
  const bp = toParts(b);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i += 1) {
    const ai = ap[i] ?? 0;
    const bi = bp[i] ?? 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return true;
};

export const otaRoutes = Router();

otaRoutes.get(
  "/:id/ota/manifest",
  requireDeviceKey,
  asyncHandler(async (req, res) => {
    const deviceId = req.params.id;
    const query = parseQuery(querySchema, req.query);

    const [device, manifest] = await Promise.all([
      collections().devices.findOne<{ fw_version?: string }>({ device_id: deviceId }),
      collections()
        .otaReleases.find<{ channel: string; version: string; min_from: string; url: string; sha256: string; size: number; signed_at: number; signature: string }>({
          channel: query.channel,
          active: true
        })
        .sort({ signed_at: -1 })
        .limit(1)
        .next()
    ]);

    if (!manifest) {
      res.json({
        ok: true,
        update_available: false,
        reason: "no_active_release"
      });
      return;
    }

    const fw = device?.fw_version ?? "0.0.0";
    const updateAvailable = versionGte(manifest.version, fw) && manifest.version !== fw && versionGte(fw, manifest.min_from);

    res.json(
      updateAvailable
        ? manifest
        : {
            ok: true,
            update_available: false,
            reason: "already_latest_or_below_min_from",
            current_version: fw,
            latest_version: manifest.version
          }
    );
  })
);
