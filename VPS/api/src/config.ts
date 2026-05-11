import { config as loadEnv } from "dotenv";

loadEnv({ override: true });

const get = (key: string, fallback?: string): string => {
  const val = process.env[key] ?? fallback;
  if (val === undefined || val === "") {
    throw new Error(`Missing required env: ${key}`);
  }
  return val;
};

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
};

const parseIntSafe = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const parseCsv = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
};

export const cfg = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8080),

  mongodbUri: get("MONGODB_URI", "mongodb://127.0.0.1:27017"),
  mongodbDbName: get("MONGODB_DB_NAME", "smart_locker"),

  jwtSecret: get("JWT_SECRET", "dev-only-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  bcryptRounds: Math.max(8, parseIntSafe(process.env.BCRYPT_ROUNDS, 10)),
  deviceProvisionKey: process.env.DEVICE_PROVISION_KEY ?? "",
  requireDeviceProvisionKey: parseBool(process.env.REQUIRE_DEVICE_PROVISION_KEY, true),
  deviceRegistrationAllowlist: parseCsv(process.env.DEVICE_REGISTRATION_ALLOWLIST),

  allowInsecureAuthBypass: parseBool(process.env.ALLOW_INSECURE_AUTH_BYPASS, false),
  allowInsecureDeviceKeyBypass: parseBool(process.env.ALLOW_INSECURE_DEVICE_KEY_BYPASS, false),
  enableGoogleAuth: parseBool(process.env.ENABLE_GOOGLE_AUTH, false),

  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
};

export const isProd = cfg.nodeEnv === "production";
