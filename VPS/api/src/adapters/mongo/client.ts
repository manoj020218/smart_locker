import { MongoClient } from "mongodb";
import { cfg } from "../../config.js";
import type { AuthUserDoc } from "../../modules/auth/types.js";

const client = new MongoClient(cfg.mongodbUri, {
  maxPoolSize: 15
});

let connected = false;

export const connectMongo = async (): Promise<void> => {
  if (!connected) {
    await client.connect();
    connected = true;
  }
};

export const db = () => client.db(cfg.mongodbDbName);

export const collections = () => {
  const database = db();
  return {
    authUsers: database.collection<AuthUserDoc>("auth_users"),
    devices: database.collection("devices"),
    cabinets: database.collection("cabinets"),
    users: database.collection("users"),
    rules: database.collection("rules"),
    drawerMappings: database.collection("drawer_mappings"),
    accessLogs: database.collection("access_logs"),
    licenses: database.collection("licenses"),
    otaReleases: database.collection("ota_releases"),
    mobileSessions: database.collection("mobile_sessions"),
    apkReleases: database.collection("apk_releases")
  };
};
