import { Router } from "express";
import { z } from "zod";
import { collections } from "../../adapters/mongo/client.js";
import type { AuthJwtPayload } from "../../shared/auth.js";
import { requireRoles } from "../../shared/auth.js";
import { badRequest, forbidden, notFound } from "../../shared/errors.js";
import { asyncHandler } from "../../shared/http.js";
import { hashPassword } from "../../shared/password.js";
import { parseBody, parseQuery } from "../../shared/validation.js";
import { buildSeedUserId } from "../auth/service.js";
import type { AuthUserDoc } from "../auth/types.js";
import { resolveHealthStatus, resolveManufacturerIdFromClaims } from "./service.js";

const manufacturerQuerySchema = z.object({
  manufacturer_id: z.string().min(1).optional()
});

const cabinetsQuerySchema = manufacturerQuerySchema.extend({
  owner_id: z.string().min(1).optional(),
  health_status: z.enum(["online", "offline", "never_seen"]).optional()
});

const healthQuerySchema = cabinetsQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(500).default(200)
});

const usageQuerySchema = manufacturerQuerySchema.extend({
  cabinet_id: z.string().min(1).optional(),
  from_ts: z.coerce.number().int().nonnegative().optional(),
  to_ts: z.coerce.number().int().nonnegative().optional(),
  result: z.enum(["open", "deny"]).optional(),
  group_by: z.enum(["cabinet", "day"]).default("cabinet")
});

const ownerCreateSchema = z.object({
  manufacturer_id: z.string().min(1).optional(),
  tenant_id: z.string().min(1).optional(),
  owner_user_id: z.string().min(1).optional(),
  display_name: z.string().min(2),
  company_name: z.string().min(1).optional(),
  email: z.string().email(),
  mobile: z.string().min(6).max(20).optional(),
  password: z.string().min(8),
  status: z.enum(["active", "inactive", "blocked"]).default("active"),
  cabinet_ids: z.array(z.string().min(1)).default([]),
  must_change_password: z.boolean().default(true)
});

const ownerAssignSchema = z.object({
  manufacturer_id: z.string().min(1).optional(),
  owner_user_id: z.string().min(1)
});

const offlineThresholdSec = 180;

type CabinetHealthRow = {
  cabinet_id: string;
  cabinet_name: string;
  location_name: string;
  mode: string;
  total_lockers: number;
  owner_id: string;
  device_id: string;
  firmware_version: string;
  last_seen_ts: number;
  health_status: "online" | "offline" | "never_seen";
};

const resolveTenantId = (claims: AuthJwtPayload, requestedTenantId?: string): string => {
  if (claims.role === "super_admin") {
    return requestedTenantId?.trim() || claims.tenant_id;
  }
  return claims.tenant_id;
};

const loadCabinetHealthRows = async (
  manufacturerId: string,
  ownerId?: string
): Promise<CabinetHealthRow[]> => {
  const cabinetFilter: Record<string, unknown> = { manufacturer_id: manufacturerId };
  if (ownerId) {
    cabinetFilter.owner_id = ownerId;
  }

  const cabinetDocs = await collections()
    .cabinets.find<{
      cabinet_id: string;
      cabinet_name?: string;
      location_name?: string;
      mode?: string;
      total_lockers?: number;
      owner_id?: string;
    }>(cabinetFilter)
    .project({ _id: 0, cabinet_id: 1, cabinet_name: 1, location_name: 1, mode: 1, total_lockers: 1, owner_id: 1 })
    .toArray();

  const cabinetIds = cabinetDocs.map((c) => c.cabinet_id);
  if (cabinetIds.length === 0) {
    return [];
  }

  const deviceDocs = await collections()
    .devices.find<{ cabinet_id: string; device_id?: string; fw_version?: string; last_seen_at?: Date }>({
      cabinet_id: { $in: cabinetIds }
    })
    .project({ _id: 0, cabinet_id: 1, device_id: 1, fw_version: 1, last_seen_at: 1 })
    .toArray();

  const deviceByCabinet = new Map(deviceDocs.map((d) => [d.cabinet_id, d]));
  const nowMs = Date.now();

  return cabinetDocs.map((cab) => {
    const device = deviceByCabinet.get(cab.cabinet_id);
    const health = resolveHealthStatus(device?.last_seen_at, nowMs, offlineThresholdSec);
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
      health_status: health
    };
  });
};

const countHealthStats = (rows: CabinetHealthRow[]) => {
  const online = rows.filter((r) => r.health_status === "online").length;
  const offline = rows.filter((r) => r.health_status === "offline").length;
  const neverSeen = rows.filter((r) => r.health_status === "never_seen").length;
  const lastSeenTs = rows.reduce((max, row) => Math.max(max, row.last_seen_ts), 0);
  return {
    total_cabinets: rows.length,
    online_cabinets: online,
    offline_cabinets: offline,
    never_seen_cabinets: neverSeen,
    last_seen_ts: lastSeenTs
  };
};

export const manufacturerRoutes = Router();

manufacturerRoutes.use(requireRoles(["manufacturer", "super_admin"]));

manufacturerRoutes.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const query = parseQuery(manufacturerQuerySchema, req.query);
    const manufacturerId = resolveManufacturerIdFromClaims(claims, query.manufacturer_id);

    const rows = await loadCabinetHealthRows(manufacturerId);
    const stats = countHealthStats(rows);

    res.json({
      ok: true,
      manufacturer_id: manufacturerId,
      stats
    });
  })
);

manufacturerRoutes.get(
  "/cabinets",
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const query = parseQuery(cabinetsQuerySchema, req.query);
    const manufacturerId = resolveManufacturerIdFromClaims(claims, query.manufacturer_id);

    const rows = await loadCabinetHealthRows(manufacturerId, query.owner_id);
    const filtered = query.health_status ? rows.filter((row) => row.health_status === query.health_status) : rows;

    res.json({
      ok: true,
      manufacturer_id: manufacturerId,
      cabinets: filtered
    });
  })
);

manufacturerRoutes.get(
  "/health",
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const query = parseQuery(healthQuerySchema, req.query);
    const manufacturerId = resolveManufacturerIdFromClaims(claims, query.manufacturer_id);

    const rows = await loadCabinetHealthRows(manufacturerId, query.owner_id);
    const filtered = query.health_status ? rows.filter((row) => row.health_status === query.health_status) : rows;
    const limited = filtered.slice(0, query.limit);

    res.json({
      ok: true,
      manufacturer_id: manufacturerId,
      stats: countHealthStats(rows),
      filtered_count: filtered.length,
      items: limited
    });
  })
);

manufacturerRoutes.get(
  "/usage",
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const query = parseQuery(usageQuerySchema, req.query);
    const manufacturerId = resolveManufacturerIdFromClaims(claims, query.manufacturer_id);

    if (query.from_ts !== undefined && query.to_ts !== undefined && query.from_ts > query.to_ts) {
      throw badRequest("from_ts cannot be greater than to_ts");
    }

    const cabinets = await collections()
      .cabinets.find<{ cabinet_id: string }>({ manufacturer_id: manufacturerId })
      .project({ _id: 0, cabinet_id: 1 })
      .toArray();
    const cabinetIds = cabinets.map((c) => c.cabinet_id);
    if (cabinetIds.length === 0) {
      res.json({
        ok: true,
        manufacturer_id: manufacturerId,
        summary: {
          total_events: 0,
          open_events: 0,
          deny_events: 0,
          unique_users: 0,
          cabinet_count: 0
        },
        items: []
      });
      return;
    }

    let scopedCabinetIds = cabinetIds;
    if (query.cabinet_id) {
      if (!cabinetIds.includes(query.cabinet_id)) {
        throw forbidden("Cabinet is outside manufacturer scope");
      }
      scopedCabinetIds = [query.cabinet_id];
    }

    const match: Record<string, unknown> = {
      cabinet_id: { $in: scopedCabinetIds }
    };
    if (query.result) {
      match.result = query.result;
    }
    if (query.from_ts !== undefined || query.to_ts !== undefined) {
      const tsRange: Record<string, number> = {};
      if (query.from_ts !== undefined) tsRange.$gte = query.from_ts;
      if (query.to_ts !== undefined) tsRange.$lte = query.to_ts;
      match.ts = tsRange;
    }

    const summaryAgg = await collections()
      .accessLogs.aggregate<{
        _id: null;
        total_events: number;
        open_events: number;
        deny_events: number;
        unique_users: string[];
      }>([
        { $match: match },
        {
          $group: {
            _id: null,
            total_events: { $sum: 1 },
            open_events: {
              $sum: {
                $cond: [{ $eq: ["$result", "open"] }, 1, 0]
              }
            },
            deny_events: {
              $sum: {
                $cond: [{ $eq: ["$result", "deny"] }, 1, 0]
              }
            },
            unique_users: {
              $addToSet: {
                $ifNull: ["$user_ref", ""]
              }
            }
          }
        }
      ])
      .toArray();

    let items: Array<Record<string, unknown>> = [];
    if (query.group_by === "day") {
      const byDay = await collections()
        .accessLogs.aggregate<{
          _id: { day: string; result: string };
          count: number;
        }>([
          { $match: match },
          {
            $project: {
              day: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: { $toDate: { $multiply: ["$ts", 1000] } }
                }
              },
              result: 1
            }
          },
          {
            $group: {
              _id: { day: "$day", result: "$result" },
              count: { $sum: 1 }
            }
          }
        ])
        .toArray();

      const dayMap = new Map<string, { day: string; open_events: number; deny_events: number; total_events: number }>();
      for (const row of byDay) {
        const day = row._id.day;
        const entry = dayMap.get(day) ?? { day, open_events: 0, deny_events: 0, total_events: 0 };
        if (row._id.result === "open") entry.open_events += row.count;
        if (row._id.result === "deny") entry.deny_events += row.count;
        entry.total_events += row.count;
        dayMap.set(day, entry);
      }
      items = Array.from(dayMap.values()).sort((a, b) => (a.day < b.day ? -1 : 1));
    } else {
      const byCabinet = await collections()
        .accessLogs.aggregate<{
          _id: { cabinet_id: string; result: string };
          count: number;
          first_ts: number;
          last_ts: number;
        }>([
          { $match: match },
          {
            $group: {
              _id: { cabinet_id: "$cabinet_id", result: "$result" },
              count: { $sum: 1 },
              first_ts: { $min: "$ts" },
              last_ts: { $max: "$ts" }
            }
          }
        ])
        .toArray();

      const cabinetMap = new Map<
        string,
        { cabinet_id: string; open_events: number; deny_events: number; total_events: number; first_ts: number; last_ts: number }
      >();
      for (const row of byCabinet) {
        const cabId = row._id.cabinet_id;
        const entry =
          cabinetMap.get(cabId) ??
          { cabinet_id: cabId, open_events: 0, deny_events: 0, total_events: 0, first_ts: row.first_ts, last_ts: row.last_ts };
        if (row._id.result === "open") entry.open_events += row.count;
        if (row._id.result === "deny") entry.deny_events += row.count;
        entry.total_events += row.count;
        entry.first_ts = Math.min(entry.first_ts, row.first_ts);
        entry.last_ts = Math.max(entry.last_ts, row.last_ts);
        cabinetMap.set(cabId, entry);
      }
      items = Array.from(cabinetMap.values()).sort((a, b) => (a.cabinet_id < b.cabinet_id ? -1 : 1));
    }

    const summaryRow = summaryAgg[0];
    const uniqueUsers = (summaryRow?.unique_users ?? []).filter((u) => u && u.length > 0);
    res.json({
      ok: true,
      manufacturer_id: manufacturerId,
      filters: {
        cabinet_id: query.cabinet_id ?? "",
        from_ts: query.from_ts ?? 0,
        to_ts: query.to_ts ?? 0,
        result: query.result ?? "",
        group_by: query.group_by
      },
      summary: {
        total_events: summaryRow?.total_events ?? 0,
        open_events: summaryRow?.open_events ?? 0,
        deny_events: summaryRow?.deny_events ?? 0,
        unique_users: uniqueUsers.length,
        cabinet_count: scopedCabinetIds.length
      },
      items
    });
  })
);

manufacturerRoutes.get(
  "/owners",
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const query = parseQuery(
      manufacturerQuerySchema.extend({
        status: z.enum(["active", "inactive", "blocked"]).optional()
      }),
      req.query
    );
    const manufacturerId = resolveManufacturerIdFromClaims(claims, query.manufacturer_id);

    const ownerFilter: Record<string, unknown> = {
      role: "owner",
      manufacturer_id: manufacturerId
    };
    if (query.status) {
      ownerFilter.status = query.status;
    }

    const owners = await collections()
      .authUsers.find<AuthUserDoc>(ownerFilter)
      .project({
        _id: 0,
        user_id: 1,
        owner_id: 1,
        display_name: 1,
        email: 1,
        mobile: 1,
        status: 1,
        tenant_id: 1,
        cabinet_ids: 1,
        last_login_at: 1,
        updated_at: 1
      })
      .toArray();

    res.json({
      ok: true,
      manufacturer_id: manufacturerId,
      owners: owners.map((o) => ({
        owner_user_id: o.user_id,
        owner_id: o.owner_id ?? o.user_id,
        display_name: o.display_name,
        email: o.email ?? "",
        mobile: o.mobile ?? "",
        status: o.status,
        tenant_id: o.tenant_id,
        cabinet_ids: o.cabinet_ids ?? [],
        last_login_ts: o.last_login_at ? Math.floor(o.last_login_at.getTime() / 1000) : 0,
        updated_ts: Math.floor(o.updated_at.getTime() / 1000)
      }))
    });
  })
);

manufacturerRoutes.post(
  "/owners",
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const body = parseBody(ownerCreateSchema, req.body);
    const manufacturerId = resolveManufacturerIdFromClaims(claims, body.manufacturer_id);
    const tenantId = resolveTenantId(claims, body.tenant_id);
    const emailLower = body.email.trim().toLowerCase();
    const mobile = body.mobile?.trim() ?? "";
    const cabinetIds = body.cabinet_ids ?? [];
    const ownerStatus = body.status ?? "active";

    const duplicateFilter = mobile
      ? { $or: [{ email_lower: emailLower }, { mobile }] }
      : { email_lower: emailLower };
    const duplicate = await collections().authUsers.findOne<AuthUserDoc>(duplicateFilter);
    if (duplicate) {
      throw badRequest("Owner already exists with same email or mobile");
    }

    if (cabinetIds.length > 0) {
      const assignedCount = await collections().cabinets.countDocuments({
        manufacturer_id: manufacturerId,
        cabinet_id: { $in: cabinetIds }
      });
      if (assignedCount !== cabinetIds.length) {
        throw forbidden("One or more cabinet_ids are outside manufacturer scope");
      }
    }

    const ownerUserId = body.owner_user_id?.trim() || buildSeedUserId("owner", emailLower);
    const existingById = await collections().authUsers.findOne<AuthUserDoc>({ user_id: ownerUserId });
    if (existingById) {
      throw badRequest("owner_user_id already exists");
    }

    const passwordHash = await hashPassword(body.password);
    await collections().authUsers.insertOne({
      user_id: ownerUserId,
      owner_id: ownerUserId,
      display_name: body.company_name?.trim() || body.display_name.trim(),
      email: body.email.trim(),
      email_lower: emailLower,
      ...(mobile ? { mobile } : {}),
      password_hash: passwordHash,
      role: "owner",
      status: ownerStatus,
      tenant_id: tenantId,
      manufacturer_id: manufacturerId,
      cabinet_ids: cabinetIds,
      fcm_tokens: [],
      must_change_password: body.must_change_password,
      created_at: new Date(),
      updated_at: new Date()
    });

    if (cabinetIds.length > 0) {
      await collections().cabinets.updateMany(
        { manufacturer_id: manufacturerId, cabinet_id: { $in: cabinetIds } },
        { $set: { owner_id: ownerUserId, updated_at: new Date() } }
      );
    }

    res.json({
      ok: true,
      manufacturer_id: manufacturerId,
      owner_user_id: ownerUserId,
      tenant_id: tenantId,
      assigned_cabinets: cabinetIds
    });
  })
);

manufacturerRoutes.post(
  "/cabinets/:cabinetId/assign-owner",
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const body = parseBody(ownerAssignSchema, req.body);
    const manufacturerId = resolveManufacturerIdFromClaims(claims, body.manufacturer_id);
    const cabinetId = req.params.cabinetId?.trim();
    if (!cabinetId) {
      throw badRequest("cabinetId path parameter is required");
    }

    const cabinet = await collections().cabinets.findOne<{ cabinet_id: string }>({
      cabinet_id: cabinetId,
      manufacturer_id: manufacturerId
    });
    if (!cabinet) {
      throw notFound("Cabinet not found in manufacturer scope");
    }

    const owner = await collections().authUsers.findOne<AuthUserDoc>({
      user_id: body.owner_user_id,
      role: "owner",
      manufacturer_id: manufacturerId
    });
    if (!owner) {
      throw badRequest("Owner is not found in manufacturer scope");
    }

    await collections().cabinets.updateOne(
      { cabinet_id: cabinetId, manufacturer_id: manufacturerId },
      {
        $set: {
          owner_id: body.owner_user_id,
          updated_at: new Date()
        }
      }
    );
    await collections().authUsers.updateOne(
      { user_id: body.owner_user_id },
      {
        $addToSet: {
          cabinet_ids: cabinetId
        },
        $set: {
          updated_at: new Date()
        }
      }
    );

    res.json({
      ok: true,
      manufacturer_id: manufacturerId,
      cabinet_id: cabinetId,
      owner_user_id: body.owner_user_id
    });
  })
);

manufacturerRoutes.post(
  "/cabinets/register",
  asyncHandler(async (req, res) => {
    const claims = (req as typeof req & { user: AuthJwtPayload }).user;
    const body = parseBody(
      z.object({
        manufacturer_id: z.string().min(1).optional(),
        tenant_id: z.string().min(1).optional(),
        cabinet_id: z.string().min(1),
        cabinet_name: z.string().min(1),
        location_name: z.string().min(1).optional(),
        owner_id: z.string().min(1).optional(),
        total_lockers: z.number().int().positive().max(1000).default(24),
        mode: z.enum(["DEMO", "COMMERCIAL"]).default("DEMO"),
        access_modes: z.array(z.enum(["QR_MEMBER", "QR_CABINET", "WIEGAND", "FACE", "PAID_PUBLIC"])).default(["WIEGAND"])
      }),
      req.body
    );

    const manufacturerId = resolveManufacturerIdFromClaims(claims, body.manufacturer_id);
    const tenantId = resolveTenantId(claims, body.tenant_id);

    const existing = await collections().cabinets.findOne<{ manufacturer_id?: string }>({ cabinet_id: body.cabinet_id });
    if (existing?.manufacturer_id && existing.manufacturer_id !== manufacturerId) {
      throw forbidden("Cabinet is already assigned to another manufacturer");
    }

    if (body.owner_id) {
      const owner = await collections().authUsers.findOne<AuthUserDoc>({
        user_id: body.owner_id,
        role: "owner",
        manufacturer_id: manufacturerId
      });
      if (!owner) {
        throw badRequest("owner_id is not a valid owner under this manufacturer");
      }
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

    if (body.owner_id) {
      await collections().authUsers.updateOne(
        { user_id: body.owner_id },
        {
          $addToSet: {
            cabinet_ids: body.cabinet_id
          },
          $set: {
            updated_at: new Date()
          }
        }
      );
    }

    res.json({
      ok: true,
      manufacturer_id: manufacturerId,
      tenant_id: tenantId,
      cabinet_id: body.cabinet_id
    });
  })
);
