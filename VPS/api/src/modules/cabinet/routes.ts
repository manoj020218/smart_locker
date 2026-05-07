import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { collections } from "../../adapters/mongo/client.js";
import { requireAdminJwt } from "../../shared/auth.js";
import { asyncHandler } from "../../shared/http.js";
import { parseBody } from "../../shared/validation.js";

const userSchema = z.object({
  tenant_id: z.string().min(1),
  cabinet_id: z.string().min(1),
  user_id: z.string().min(1).optional(),
  display_name: z.string().min(1),
  card_id: z.string().min(1).optional(),
  face_id: z.string().min(1).optional(),
  drawer_id: z.number().int().nonnegative().optional(),
  valid_from: z.number().int().nonnegative().optional(),
  valid_to: z.number().int().nonnegative().optional(),
  payment_required: z.boolean().optional().default(false)
});

const ruleSchema = z.object({
  tenant_id: z.string().min(1),
  cabinet_id: z.string().min(1),
  rule_id: z.string().min(1).optional(),
  user_id: z.string().min(1),
  drawer_id: z.number().int().nonnegative(),
  valid_from: z.number().int().nonnegative().default(0),
  valid_to: z.number().int().nonnegative().default(0),
  cooldown_sec: z.number().int().nonnegative().default(28800),
  payment_required: z.boolean().default(false)
});

const drawerSchema = z.object({
  tenant_id: z.string().min(1),
  cabinet_id: z.string().min(1),
  drawer_id: z.number().int().positive(),
  board_address: z.number().int().nonnegative(),
  lock_address: z.number().int().nonnegative(),
  label: z.string().min(1).optional()
});

const bumpCabinetVersion = async (cabinetId: string, tenantId: string): Promise<number> => {
  const result = await collections().cabinets.findOneAndUpdate(
    { cabinet_id: cabinetId },
    {
      $setOnInsert: {
        cabinet_id: cabinetId,
        tenant_id: tenantId,
        created_at: new Date()
      },
      $inc: { config_version: 1 },
      $set: { updated_at: new Date() }
    },
    { upsert: true, returnDocument: "after" }
  );
  return Number(result?.config_version ?? 1);
};

export const cabinetRoutes = Router();
cabinetRoutes.use(requireAdminJwt);

cabinetRoutes.post(
  "/users",
  asyncHandler(async (req, res) => {
    const body = parseBody(userSchema, req.body);
    const userId = body.user_id ?? `u-${randomUUID().slice(0, 8)}`;

    await collections().users.updateOne(
      { user_id: userId, tenant_id: body.tenant_id },
      {
        $set: {
          user_id: userId,
          tenant_id: body.tenant_id,
          cabinet_id: body.cabinet_id,
          display_name: body.display_name,
          card_id: body.card_id ?? "",
          face_id: body.face_id ?? "",
          drawer_id: body.drawer_id ?? null,
          valid_from: body.valid_from ?? 0,
          valid_to: body.valid_to ?? 0,
          payment_required: body.payment_required,
          updated_at: new Date()
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    const configVersion = await bumpCabinetVersion(body.cabinet_id, body.tenant_id);

    res.json({
      ok: true,
      user_id: userId,
      config_version: configVersion
    });
  })
);

cabinetRoutes.post(
  "/rules",
  asyncHandler(async (req, res) => {
    const body = parseBody(ruleSchema, req.body);
    const ruleId = body.rule_id ?? `r-${randomUUID().slice(0, 8)}`;

    await collections().rules.updateOne(
      { rule_id: ruleId, tenant_id: body.tenant_id },
      {
        $set: {
          rule_id: ruleId,
          tenant_id: body.tenant_id,
          cabinet_id: body.cabinet_id,
          user_id: body.user_id,
          drawer_id: body.drawer_id,
          valid_from: body.valid_from,
          valid_to: body.valid_to,
          cooldown_sec: body.cooldown_sec,
          payment_required: body.payment_required,
          updated_at: new Date()
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    const configVersion = await bumpCabinetVersion(body.cabinet_id, body.tenant_id);

    res.json({
      ok: true,
      rule_id: ruleId,
      config_version: configVersion
    });
  })
);

cabinetRoutes.post(
  "/drawers/map",
  asyncHandler(async (req, res) => {
    const body = parseBody(drawerSchema, req.body);

    await collections().drawerMappings.updateOne(
      { cabinet_id: body.cabinet_id, drawer_id: body.drawer_id },
      {
        $set: {
          tenant_id: body.tenant_id,
          cabinet_id: body.cabinet_id,
          drawer_id: body.drawer_id,
          board_address: body.board_address,
          lock_address: body.lock_address,
          label: body.label ?? `Drawer ${body.drawer_id}`,
          updated_at: new Date()
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    const configVersion = await bumpCabinetVersion(body.cabinet_id, body.tenant_id);

    res.json({
      ok: true,
      drawer_id: body.drawer_id,
      config_version: configVersion
    });
  })
);
