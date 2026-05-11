import { collections } from "./client.js";

export const ensureMongoIndexes = async (): Promise<void> => {
  const c = collections();

  await Promise.all([
    c.authUsers.createIndex({ user_id: 1 }, { unique: true }),
    c.authUsers.createIndex({ email_lower: 1 }, { unique: true, sparse: true }),
    c.authUsers.createIndex({ mobile: 1 }, { unique: true, sparse: true }),
    c.authUsers.createIndex({ role: 1, status: 1 }),
    c.authUsers.createIndex({ tenant_id: 1, role: 1 }),

    c.devices.createIndex({ device_id: 1 }, { unique: true }),
    c.devices.createIndex({ cabinet_id: 1 }),
    c.devices.createIndex({ tenant_id: 1 }),

    c.users.createIndex({ user_id: 1, tenant_id: 1 }, { unique: true }),
    c.users.createIndex({ cabinet_id: 1 }),

    c.rules.createIndex({ rule_id: 1, tenant_id: 1 }, { unique: true }),
    c.rules.createIndex({ cabinet_id: 1 }),

    c.drawerMappings.createIndex({ drawer_id: 1, cabinet_id: 1 }, { unique: true }),
    c.drawerMappings.createIndex({ board_address: 1, lock_address: 1, cabinet_id: 1 }, { unique: true }),

    c.accessLogs.createIndex({ event_id: 1 }, { unique: true }),
    c.accessLogs.createIndex({ device_id: 1, ts: -1 }),
    c.accessLogs.createIndex({ cabinet_id: 1, ts: -1 }),

    c.licenses.createIndex({ device_id: 1 }, { unique: true }),
    c.licenses.createIndex({ cabinet_id: 1 }),
    c.licenses.createIndex({ tenant_id: 1 }),

    c.otaReleases.createIndex({ channel: 1, version: -1 }),
    c.otaReleases.createIndex({ active: 1, channel: 1 }),

    c.mobileSessions.createIndex({ uid: 1, created_at: -1 }),
    c.mobileSessions.createIndex({ token_hash: 1 }, { unique: true }),

    c.apkReleases.createIndex({ platform: 1, build: -1 }),
    c.apkReleases.createIndex({ platform: 1, version: 1 }, { unique: true }),
    c.apkReleases.createIndex({ active: 1, platform: 1, released_at: -1 })
  ]);
};
