import { connectMongo, collections } from "../src/adapters/mongo/client.js";
import { ensureMongoIndexes } from "../src/adapters/mongo/indexes.js";
import type { AuthRole } from "../src/shared/auth.js";
import { hashPassword } from "../src/shared/password.js";
import { buildSeedUserId } from "../src/modules/auth/service.js";

const roles: AuthRole[] = [
  "super_admin",
  "manufacturer",
  "owner",
  "cabinet_admin",
  "operator",
  "member",
  "admin",
  "agent",
  "customer"
];

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
};

const parseCsv = (value: string | undefined): string[] =>
  value
    ? value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

const pickRole = (value: string | undefined): AuthRole => {
  const normalized = (value ?? "manufacturer").trim() as AuthRole;
  if (!roles.includes(normalized)) {
    throw new Error(`Invalid AUTH_SEED_ROLE: ${value}`);
  }
  return normalized;
};

const must = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env: ${key}`);
  }
  return value.trim();
};

const main = async (): Promise<void> => {
  const email = must("AUTH_SEED_EMAIL");
  const password = must("AUTH_SEED_PASSWORD");
  const role = pickRole(process.env.AUTH_SEED_ROLE);
  const displayName = process.env.AUTH_SEED_DISPLAY_NAME?.trim() || email;
  const mobile = process.env.AUTH_SEED_MOBILE?.trim() || "";
  const tenantId = process.env.AUTH_SEED_TENANT_ID?.trim() || "tenant-default";
  const status = (process.env.AUTH_SEED_STATUS?.trim() || "active") as "active" | "inactive" | "blocked";
  const manufacturerId = process.env.AUTH_SEED_MANUFACTURER_ID?.trim() || "";
  const ownerId = process.env.AUTH_SEED_OWNER_ID?.trim() || "";
  const cabinetIds = parseCsv(process.env.AUTH_SEED_CABINET_IDS);
  const forcePasswordReset = parseBool(process.env.AUTH_SEED_FORCE_PASSWORD_RESET, false);
  const mustChangePassword = parseBool(process.env.AUTH_SEED_MUST_CHANGE_PASSWORD, true);

  const emailLower = email.toLowerCase();
  const userId = process.env.AUTH_SEED_USER_ID?.trim() || buildSeedUserId(role, emailLower);
  const passwordHash = await hashPassword(password);

  await connectMongo();
  await ensureMongoIndexes();

  const existing = await collections().authUsers.findOne<{ user_id: string }>({ email_lower: emailLower });
  await collections().authUsers.updateOne(
    { email_lower: emailLower },
    {
      $set: {
        user_id: existing?.user_id ?? userId,
        display_name: displayName,
        email,
        email_lower: emailLower,
        mobile,
        role,
        status,
        tenant_id: tenantId,
        manufacturer_id: manufacturerId || undefined,
        owner_id: ownerId || undefined,
        cabinet_ids: cabinetIds,
        must_change_password: mustChangePassword,
        ...(forcePasswordReset || !existing ? { password_hash: passwordHash } : {}),
        updated_at: new Date()
      },
      $setOnInsert: {
        created_at: new Date()
      }
    },
    { upsert: true }
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        created: !existing,
        user_id: existing?.user_id ?? userId,
        role,
        email: emailLower,
        tenant_id: tenantId,
        password_updated: forcePasswordReset || !existing
      },
      null,
      2
    )
  );
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
