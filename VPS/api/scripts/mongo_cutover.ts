import { config as loadEnv } from "dotenv";
import { MongoClient, type Document } from "mongodb";

loadEnv({ override: true });

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const sourceDbName = process.env.MONGO_SOURCE_DB ?? "smart_cabinet";
const targetDbName = process.env.MONGO_TARGET_DB ?? "smart_locker";
const apply = process.argv.includes("--apply");
const dropTargetFirst = process.argv.includes("--drop-target-first");

const collections = [
  "devices",
  "cabinets",
  "users",
  "rules",
  "drawer_mappings",
  "access_logs",
  "licenses",
  "ota_releases",
  "mobile_sessions",
  "apk_releases"
] as const;

const keyFilter = (collectionName: string, doc: Document): Document => {
  switch (collectionName) {
    case "devices":
      return { device_id: doc.device_id };
    case "cabinets":
      return { cabinet_id: doc.cabinet_id };
    case "users":
      return { user_id: doc.user_id, tenant_id: doc.tenant_id };
    case "rules":
      return { rule_id: doc.rule_id, tenant_id: doc.tenant_id };
    case "drawer_mappings":
      return { cabinet_id: doc.cabinet_id, drawer_id: doc.drawer_id };
    case "access_logs":
      return { event_id: doc.event_id };
    case "licenses":
      return { device_id: doc.device_id };
    case "mobile_sessions":
      return { token_hash: doc.token_hash };
    case "apk_releases":
      return { platform: doc.platform, version: doc.version };
    case "ota_releases":
    default:
      return { _id: doc._id };
  }
};

const hasEmptyFilterValue = (filter: Document): boolean =>
  Object.values(filter).some((v) => v === undefined || v === null || v === "");

const run = async (): Promise<void> => {
  const client = new MongoClient(uri, { maxPoolSize: 10 });
  await client.connect();
  try {
    const srcDb = client.db(sourceDbName);
    const dstDb = client.db(targetDbName);

    console.log(`[cutover] source=${sourceDbName} target=${targetDbName} apply=${apply ? "yes" : "no"} drop_target_first=${dropTargetFirst ? "yes" : "no"}`);

    if (apply && dropTargetFirst) {
      console.log(`[cutover] dropping target database ${targetDbName}`);
      await dstDb.dropDatabase();
    }

    for (const name of collections) {
      const src = srcDb.collection(name);
      const dst = dstDb.collection(name);

      const srcCount = await src.countDocuments();
      const dstCount = await dst.countDocuments();

      console.log(`[cutover] ${name}: source=${srcCount} target_before=${dstCount}`);

      if (!apply || srcCount === 0) {
        continue;
      }

      const cursor = src.find({}, { noCursorTimeout: true });
      let scanned = 0;
      let upserted = 0;
      let modified = 0;
      let batch: Document[] = [];

      for await (const doc of cursor) {
        const filter = keyFilter(name, doc);
        if (hasEmptyFilterValue(filter)) {
          batch.push({
            replaceOne: {
              filter: { _id: doc._id },
              replacement: doc,
              upsert: true
            }
          });
        } else {
          batch.push({
            replaceOne: {
              filter,
              replacement: doc,
              upsert: true
            }
          });
        }
        ++scanned;

        if (batch.length >= 500) {
          const result = await dst.bulkWrite(batch, { ordered: false });
          upserted += result.upsertedCount;
          modified += result.modifiedCount;
          batch = [];
        }
      }

      if (batch.length > 0) {
        const result = await dst.bulkWrite(batch, { ordered: false });
        upserted += result.upsertedCount;
        modified += result.modifiedCount;
      }

      const dstAfter = await dst.countDocuments();
      console.log(`[cutover] ${name}: scanned=${scanned} upserted=${upserted} modified=${modified} target_after=${dstAfter}`);
    }

    console.log("[cutover] done");
  } finally {
    await client.close();
  }
};

run().catch((err) => {
  console.error("[cutover] failed:", err);
  process.exitCode = 1;
});

