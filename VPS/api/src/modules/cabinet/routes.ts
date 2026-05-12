import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { collections } from "../../adapters/mongo/client.js";
import { requireAuthJwt, type AuthJwtPayload } from "../../shared/auth.js";
import { badRequest, forbidden, notFound } from "../../shared/errors.js";
import { asyncHandler } from "../../shared/http.js";
import { parseBody, parseQuery } from "../../shared/validation.js";

type AdminUserDoc = {
  user_id: string;
  tenant_id: string;
  cabinet_id: string;
  display_name: string;
  card_id?: string;
  face_id?: string;
  drawer_id?: number | null;
  valid_from?: number;
  valid_to?: number;
  payment_required?: boolean;
  created_at?: Date;
  updated_at?: Date;
};

type AdminRuleDoc = {
  rule_id: string;
  tenant_id: string;
  cabinet_id: string;
  user_id: string;
  drawer_id: number;
  valid_from: number;
  valid_to: number;
  cooldown_sec: number;
  payment_required: boolean;
  created_at?: Date;
  updated_at?: Date;
};

type DrawerMappingDoc = {
  tenant_id: string;
  cabinet_id: string;
  drawer_id: number;
  board_address: number;
  lock_address: number;
  label?: string;
  created_at?: Date;
  updated_at?: Date;
};

const getClaims = (req: Request): AuthJwtPayload => {
  const claims = (req as Request & { user?: AuthJwtPayload }).user;
  if (!claims) throw forbidden("Missing auth claims");
  return claims;
};

const assertAdminRole = (claims: AuthJwtPayload): void => {
  const allowed = ["admin", "cabinet_admin", "super_admin", "manufacturer"];
  if (!allowed.includes(claims.role)) {
    throw forbidden("Insufficient role permissions");
  }
};

const assertManufacturerCabinetScope = async (
  claims: AuthJwtPayload,
  tenantId: string,
  cabinetId: string
): Promise<void> => {
  if (claims.role !== "manufacturer") return;

  const manufacturerId = (claims.manufacturer_id ?? "").trim();
  if (!manufacturerId) {
    throw forbidden("Manufacturer scope is missing manufacturer_id claim");
  }

  const cabinet = await collections().cabinets.findOne<{
    cabinet_id: string;
    tenant_id?: string;
    manufacturer_id?: string;
  }>({ cabinet_id: cabinetId });

  if (!cabinet) {
    throw forbidden("Cabinet not found in manufacturer scope");
  }

  if ((cabinet.manufacturer_id ?? "") !== manufacturerId) {
    throw forbidden("Cabinet is outside manufacturer scope");
  }

  const cabinetTenant = cabinet.tenant_id ?? "";
  if (cabinetTenant && cabinetTenant !== tenantId) {
    throw forbidden("Tenant and cabinet scope mismatch");
  }
};

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

const userUpdateSchema = z
  .object({
    tenant_id: z.string().min(1),
    cabinet_id: z.string().min(1),
    display_name: z.string().min(1).optional(),
    card_id: z.string().min(1).optional(),
    face_id: z.string().min(1).optional(),
    drawer_id: z.number().int().nonnegative().nullable().optional(),
    valid_from: z.number().int().nonnegative().optional(),
    valid_to: z.number().int().nonnegative().optional(),
    payment_required: z.boolean().optional()
  })
  .refine(
    (v) =>
      v.display_name !== undefined ||
      v.card_id !== undefined ||
      v.face_id !== undefined ||
      v.drawer_id !== undefined ||
      v.valid_from !== undefined ||
      v.valid_to !== undefined ||
      v.payment_required !== undefined,
    { message: "At least one updatable field is required" }
  );

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

const ruleUpdateSchema = z
  .object({
    tenant_id: z.string().min(1),
    cabinet_id: z.string().min(1),
    user_id: z.string().min(1).optional(),
    drawer_id: z.number().int().nonnegative().optional(),
    valid_from: z.number().int().nonnegative().optional(),
    valid_to: z.number().int().nonnegative().optional(),
    cooldown_sec: z.number().int().nonnegative().optional(),
    payment_required: z.boolean().optional()
  })
  .refine(
    (v) =>
      v.user_id !== undefined ||
      v.drawer_id !== undefined ||
      v.valid_from !== undefined ||
      v.valid_to !== undefined ||
      v.cooldown_sec !== undefined ||
      v.payment_required !== undefined,
    { message: "At least one updatable field is required" }
  );

const drawerSchema = z.object({
  tenant_id: z.string().min(1),
  cabinet_id: z.string().min(1),
  drawer_id: z.number().int().positive(),
  board_address: z.number().int().nonnegative(),
  lock_address: z.number().int().nonnegative(),
  label: z.string().min(1).optional()
});

const drawerUpdateSchema = z
  .object({
    tenant_id: z.string().min(1),
    cabinet_id: z.string().min(1),
    board_address: z.number().int().nonnegative().optional(),
    lock_address: z.number().int().nonnegative().optional(),
    label: z.string().min(1).optional()
  })
  .refine((v) => v.board_address !== undefined || v.lock_address !== undefined || v.label !== undefined, {
    message: "At least one updatable field is required"
  });

const tenantCabinetQuerySchema = z.object({
  tenant_id: z.string().min(1),
  cabinet_id: z.string().min(1),
  limit: z.coerce.number().int().positive().max(500).default(200)
});

const tenantCabinetNoLimitQuerySchema = z.object({
  tenant_id: z.string().min(1),
  cabinet_id: z.string().min(1)
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
cabinetRoutes.use(requireAuthJwt);

cabinetRoutes.get(
  "/users",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const query = parseQuery(tenantCabinetQuerySchema, req.query);
    await assertManufacturerCabinetScope(claims, query.tenant_id, query.cabinet_id);

    const users = await collections()
      .users.find<AdminUserDoc>({
        tenant_id: query.tenant_id,
        cabinet_id: query.cabinet_id
      })
      .project({
        _id: 0,
        user_id: 1,
        tenant_id: 1,
        cabinet_id: 1,
        display_name: 1,
        card_id: 1,
        face_id: 1,
        drawer_id: 1,
        valid_from: 1,
        valid_to: 1,
        payment_required: 1,
        created_at: 1,
        updated_at: 1
      })
      .sort({ updated_at: -1 })
      .limit(query.limit ?? 200)
      .toArray();

    res.json({
      ok: true,
      tenant_id: query.tenant_id,
      cabinet_id: query.cabinet_id,
      users
    });
  })
);

cabinetRoutes.post(
  "/users",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const body = parseBody(userSchema, req.body);
    await assertManufacturerCabinetScope(claims, body.tenant_id, body.cabinet_id);
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

cabinetRoutes.put(
  "/users/:user_id",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const userId = req.params.user_id?.trim() ?? "";
    if (!userId) throw badRequest("user_id path parameter is required");

    const body = parseBody(userUpdateSchema, req.body);
    await assertManufacturerCabinetScope(claims, body.tenant_id, body.cabinet_id);

    const result = await collections().users.updateOne(
      {
        user_id: userId,
        tenant_id: body.tenant_id,
        cabinet_id: body.cabinet_id
      },
      {
        $set: {
          ...(body.display_name !== undefined ? { display_name: body.display_name } : {}),
          ...(body.card_id !== undefined ? { card_id: body.card_id } : {}),
          ...(body.face_id !== undefined ? { face_id: body.face_id } : {}),
          ...(body.drawer_id !== undefined ? { drawer_id: body.drawer_id } : {}),
          ...(body.valid_from !== undefined ? { valid_from: body.valid_from } : {}),
          ...(body.valid_to !== undefined ? { valid_to: body.valid_to } : {}),
          ...(body.payment_required !== undefined ? { payment_required: body.payment_required } : {}),
          updated_at: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      throw notFound("User not found in cabinet scope");
    }

    const configVersion = await bumpCabinetVersion(body.cabinet_id, body.tenant_id);
    res.json({
      ok: true,
      user_id: userId,
      config_version: configVersion
    });
  })
);

cabinetRoutes.delete(
  "/users/:user_id",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const userId = req.params.user_id?.trim() ?? "";
    if (!userId) throw badRequest("user_id path parameter is required");

    const query = parseQuery(tenantCabinetNoLimitQuerySchema, req.query);
    await assertManufacturerCabinetScope(claims, query.tenant_id, query.cabinet_id);

    const result = await collections().users.deleteOne({
      user_id: userId,
      tenant_id: query.tenant_id,
      cabinet_id: query.cabinet_id
    });

    if (!result.deletedCount) {
      throw notFound("User not found in cabinet scope");
    }

    const configVersion = await bumpCabinetVersion(query.cabinet_id, query.tenant_id);
    res.json({
      ok: true,
      user_id: userId,
      config_version: configVersion
    });
  })
);

cabinetRoutes.get(
  "/rules",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const query = parseQuery(tenantCabinetQuerySchema, req.query);
    await assertManufacturerCabinetScope(claims, query.tenant_id, query.cabinet_id);

    const rules = await collections()
      .rules.find<AdminRuleDoc>({
        tenant_id: query.tenant_id,
        cabinet_id: query.cabinet_id
      })
      .project({
        _id: 0,
        rule_id: 1,
        tenant_id: 1,
        cabinet_id: 1,
        user_id: 1,
        drawer_id: 1,
        valid_from: 1,
        valid_to: 1,
        cooldown_sec: 1,
        payment_required: 1,
        created_at: 1,
        updated_at: 1
      })
      .sort({ updated_at: -1 })
      .limit(query.limit ?? 200)
      .toArray();

    res.json({
      ok: true,
      tenant_id: query.tenant_id,
      cabinet_id: query.cabinet_id,
      rules
    });
  })
);

cabinetRoutes.post(
  "/rules",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const body = parseBody(ruleSchema, req.body);
    await assertManufacturerCabinetScope(claims, body.tenant_id, body.cabinet_id);
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

cabinetRoutes.put(
  "/rules/:rule_id",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const ruleId = req.params.rule_id?.trim() ?? "";
    if (!ruleId) throw badRequest("rule_id path parameter is required");

    const body = parseBody(ruleUpdateSchema, req.body);
    await assertManufacturerCabinetScope(claims, body.tenant_id, body.cabinet_id);

    const result = await collections().rules.updateOne(
      {
        rule_id: ruleId,
        tenant_id: body.tenant_id,
        cabinet_id: body.cabinet_id
      },
      {
        $set: {
          ...(body.user_id !== undefined ? { user_id: body.user_id } : {}),
          ...(body.drawer_id !== undefined ? { drawer_id: body.drawer_id } : {}),
          ...(body.valid_from !== undefined ? { valid_from: body.valid_from } : {}),
          ...(body.valid_to !== undefined ? { valid_to: body.valid_to } : {}),
          ...(body.cooldown_sec !== undefined ? { cooldown_sec: body.cooldown_sec } : {}),
          ...(body.payment_required !== undefined ? { payment_required: body.payment_required } : {}),
          updated_at: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      throw notFound("Rule not found in cabinet scope");
    }

    const configVersion = await bumpCabinetVersion(body.cabinet_id, body.tenant_id);
    res.json({
      ok: true,
      rule_id: ruleId,
      config_version: configVersion
    });
  })
);

cabinetRoutes.delete(
  "/rules/:rule_id",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const ruleId = req.params.rule_id?.trim() ?? "";
    if (!ruleId) throw badRequest("rule_id path parameter is required");

    const query = parseQuery(tenantCabinetNoLimitQuerySchema, req.query);
    await assertManufacturerCabinetScope(claims, query.tenant_id, query.cabinet_id);

    const result = await collections().rules.deleteOne({
      rule_id: ruleId,
      tenant_id: query.tenant_id,
      cabinet_id: query.cabinet_id
    });

    if (!result.deletedCount) {
      throw notFound("Rule not found in cabinet scope");
    }

    const configVersion = await bumpCabinetVersion(query.cabinet_id, query.tenant_id);
    res.json({
      ok: true,
      rule_id: ruleId,
      config_version: configVersion
    });
  })
);

cabinetRoutes.get(
  "/drawers",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const query = parseQuery(tenantCabinetQuerySchema, req.query);
    await assertManufacturerCabinetScope(claims, query.tenant_id, query.cabinet_id);

    const drawers = await collections()
      .drawerMappings.find<DrawerMappingDoc>({
        tenant_id: query.tenant_id,
        cabinet_id: query.cabinet_id
      })
      .project({
        _id: 0,
        tenant_id: 1,
        cabinet_id: 1,
        drawer_id: 1,
        board_address: 1,
        lock_address: 1,
        label: 1,
        created_at: 1,
        updated_at: 1
      })
      .sort({ drawer_id: 1 })
      .limit(query.limit ?? 200)
      .toArray();

    res.json({
      ok: true,
      tenant_id: query.tenant_id,
      cabinet_id: query.cabinet_id,
      drawers
    });
  })
);

cabinetRoutes.post(
  "/drawers/map",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const body = parseBody(drawerSchema, req.body);
    await assertManufacturerCabinetScope(claims, body.tenant_id, body.cabinet_id);

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

cabinetRoutes.put(
  "/drawers/:drawer_id",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const drawerIdRaw = req.params.drawer_id?.trim() ?? "";
    const drawerId = Number(drawerIdRaw);
    if (!Number.isInteger(drawerId) || drawerId <= 0) {
      throw badRequest("drawer_id path parameter must be a positive integer");
    }

    const body = parseBody(drawerUpdateSchema, req.body);
    await assertManufacturerCabinetScope(claims, body.tenant_id, body.cabinet_id);

    const result = await collections().drawerMappings.updateOne(
      {
        cabinet_id: body.cabinet_id,
        tenant_id: body.tenant_id,
        drawer_id: drawerId
      },
      {
        $set: {
          ...(body.board_address !== undefined ? { board_address: body.board_address } : {}),
          ...(body.lock_address !== undefined ? { lock_address: body.lock_address } : {}),
          ...(body.label !== undefined ? { label: body.label } : {}),
          updated_at: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      throw notFound("Drawer mapping not found in cabinet scope");
    }

    const configVersion = await bumpCabinetVersion(body.cabinet_id, body.tenant_id);
    res.json({
      ok: true,
      drawer_id: drawerId,
      config_version: configVersion
    });
  })
);

cabinetRoutes.delete(
  "/drawers/:drawer_id",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const drawerIdRaw = req.params.drawer_id?.trim() ?? "";
    const drawerId = Number(drawerIdRaw);
    if (!Number.isInteger(drawerId) || drawerId <= 0) {
      throw badRequest("drawer_id path parameter must be a positive integer");
    }

    const query = parseQuery(tenantCabinetNoLimitQuerySchema, req.query);
    await assertManufacturerCabinetScope(claims, query.tenant_id, query.cabinet_id);

    const result = await collections().drawerMappings.deleteOne({
      tenant_id: query.tenant_id,
      cabinet_id: query.cabinet_id,
      drawer_id: drawerId
    });

    if (!result.deletedCount) {
      throw notFound("Drawer mapping not found in cabinet scope");
    }

    const configVersion = await bumpCabinetVersion(query.cabinet_id, query.tenant_id);
    res.json({
      ok: true,
      drawer_id: drawerId,
      config_version: configVersion
    });
  })
);

cabinetRoutes.get(
  "/cabinet/config",
  asyncHandler(async (req, res) => {
    const claims = getClaims(req);
    assertAdminRole(claims);
    const query = parseQuery(tenantCabinetNoLimitQuerySchema, req.query);
    await assertManufacturerCabinetScope(claims, query.tenant_id, query.cabinet_id);

    const [cabinet, users, rules, drawers] = await Promise.all([
      collections().cabinets.findOne<{ cabinet_id: string; config_version?: number; updated_at?: Date }>({
        cabinet_id: query.cabinet_id
      }),
      collections()
        .users.find<AdminUserDoc>({ tenant_id: query.tenant_id, cabinet_id: query.cabinet_id })
        .project({ _id: 0 })
        .sort({ updated_at: -1 })
        .toArray(),
      collections()
        .rules.find<AdminRuleDoc>({ tenant_id: query.tenant_id, cabinet_id: query.cabinet_id })
        .project({ _id: 0 })
        .sort({ updated_at: -1 })
        .toArray(),
      collections()
        .drawerMappings.find<DrawerMappingDoc>({ tenant_id: query.tenant_id, cabinet_id: query.cabinet_id })
        .project({ _id: 0 })
        .sort({ drawer_id: 1 })
        .toArray()
    ]);

    res.json({
      ok: true,
      tenant_id: query.tenant_id,
      cabinet_id: query.cabinet_id,
      config_version: Number(cabinet?.config_version ?? 1),
      updated_at_ts: cabinet?.updated_at ? Math.floor(cabinet.updated_at.getTime() / 1000) : 0,
      users,
      rules,
      drawers
    });
  })
);
