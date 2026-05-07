import { Router } from "express";
import { z } from "zod";
import { collections } from "../../adapters/mongo/client.js";
import { requireAdminJwt } from "../../shared/auth.js";
import { asyncHandler } from "../../shared/http.js";
import { parseBody, parseQuery } from "../../shared/validation.js";

const publicQuerySchema = z.object({
  platform: z.enum(["android"]).default("android")
});

const releaseSchema = z.object({
  platform: z.enum(["android"]).default("android"),
  version: z.string().min(1),
  build: z.number().int().nonnegative(),
  url: z.string().url(),
  release_notes: z.string().min(1).default(""),
  mandatory: z.boolean().default(false),
  min_supported_build: z.number().int().nonnegative().default(0),
  checksum_sha256: z.string().min(1).optional()
});

export const apkPublicRoutes = Router();
export const apkAdminRoutes = Router();

apkPublicRoutes.get(
  "/version",
  asyncHandler(async (req, res) => {
    const query = parseQuery(publicQuerySchema, req.query);
    const latest = await collections()
      .apkReleases.find<{
        platform: "android";
        version: string;
        build: number;
        url: string;
        release_notes: string;
        mandatory: boolean;
        min_supported_build: number;
        checksum_sha256?: string;
        released_at: string;
      }>({ platform: query.platform, active: true })
      .sort({ build: -1, released_at: -1 })
      .limit(1)
      .next();

    if (!latest) {
      res.status(404).json({
        ok: false,
        error: "no_apk_release",
        message: "No active APK release found"
      });
      return;
    }

    res.json(latest);
  })
);

apkAdminRoutes.use(requireAdminJwt);

apkAdminRoutes.post(
  "/releases",
  asyncHandler(async (req, res) => {
    const body = parseBody(releaseSchema, req.body);
    const releasedAt = new Date().toISOString().slice(0, 10);

    await collections().apkReleases.updateOne(
      { platform: body.platform, version: body.version },
      {
        $set: {
          ...body,
          active: true,
          released_at: releasedAt,
          updated_at: new Date()
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    await collections().apkReleases.updateMany(
      { platform: body.platform, version: { $ne: body.version } },
      { $set: { active: false, updated_at: new Date() } }
    );

    res.json({
      ok: true,
      platform: body.platform,
      version: body.version,
      build: body.build,
      released_at: releasedAt
    });
  })
);
