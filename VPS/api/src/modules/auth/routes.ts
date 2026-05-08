import { Router } from "express";
import { z } from "zod";
import { verifyFirebaseIdToken } from "../../adapters/firebase/firebase_admin.js";
import { collections } from "../../adapters/mongo/client.js";
import { cfg } from "../../config.js";
import { unauthorized } from "../../shared/errors.js";
import { asyncHandler } from "../../shared/http.js";
import { signMobileJwt, hashToken } from "../../shared/auth.js";
import { parseBody } from "../../shared/validation.js";

const bodySchema = z.object({
  id_token: z.string().min(1).optional(),
  tenant_id: z.string().min(1).default("tenant-default"),
  cabinet_id: z.string().min(1).optional(),
  requested_role: z.enum(["admin", "agent", "customer"]).optional(),
  email: z.string().email().optional(),
  name: z.string().min(1).optional()
});

export const authRoutes = Router();

authRoutes.post(
  "/mobile/google",
  asyncHandler(async (req, res) => {
    const body = parseBody(bodySchema, req.body);

    let uid = "";
    let email = "";
    let name = "";

    if (cfg.allowInsecureAuthBypass) {
      uid = `dev-${body.email ?? "user"}`;
      email = body.email ?? "dev-admin@local.test";
      name = body.name ?? "Dev Admin";
    } else {
      if (!body.id_token) {
        throw unauthorized("id_token is required");
      }
      let decoded;
      try {
        decoded = await verifyFirebaseIdToken(body.id_token);
      } catch {
        throw unauthorized("Invalid or unverifiable id_token");
      }
      uid = decoded.uid;
      email = decoded.email ?? "";
      name = decoded.name ?? "";
    }

    const users = collections().users;
    const existing = await users.findOne<{
      user_id: string;
      auth_uid: string;
      email: string;
      role: "admin" | "agent" | "customer";
      tenant_id: string;
      cabinet_id?: string;
      display_name?: string;
    }>({ auth_uid: uid });

    const role: "admin" | "agent" | "customer" = existing?.role ?? body.requested_role ?? "admin";
    const tenantId: string = existing?.tenant_id ?? body.tenant_id ?? "tenant-default";
    const cabinetId = existing?.cabinet_id ?? body.cabinet_id ?? "cab-default";
    const userId = existing?.user_id ?? `usr-${uid.slice(-8).replace(/[^a-zA-Z0-9]/g, "") || "local"}`;

    await users.updateOne(
      { auth_uid: uid },
      {
        $set: {
          user_id: userId,
          auth_uid: uid,
          email,
          display_name: name,
          role,
          tenant_id: tenantId,
          cabinet_id: cabinetId,
          updated_at: new Date()
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    const accessToken = signMobileJwt({
      uid,
      email,
      role,
      tenant_id: tenantId
    });

    await collections().mobileSessions.insertOne({
      uid,
      tenant_id: tenantId,
      token_hash: hashToken(accessToken),
      created_at: new Date()
    });

    res.json({
      ok: true,
      token: accessToken,
      profile: {
        uid,
        email,
        name,
        role,
        tenant_id: tenantId,
        cabinet_id: cabinetId
      }
    });
  })
);
