import { config as loadEnv } from "dotenv";

loadEnv();

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

export const cfg = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8080),

  mongodbUri: get("MONGODB_URI", "mongodb://127.0.0.1:27017"),
  mongodbDbName: get("MONGODB_DB_NAME", "smart_cabinet"),

  jwtSecret: get("JWT_SECRET", "dev-only-change-me"),
  deviceProvisionKey: process.env.DEVICE_PROVISION_KEY ?? "",

  allowInsecureAuthBypass: parseBool(process.env.ALLOW_INSECURE_AUTH_BYPASS, false),
  allowInsecureDeviceKeyBypass: parseBool(process.env.ALLOW_INSECURE_DEVICE_KEY_BYPASS, false),

  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
};

export const isProd = cfg.nodeEnv === "production";
