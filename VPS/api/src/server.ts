import { createApp } from "./app.js";
import { initFirebaseAdmin } from "./adapters/firebase/firebase_admin.js";
import { connectMongo } from "./adapters/mongo/client.js";
import { ensureMongoIndexes } from "./adapters/mongo/indexes.js";
import { cfg } from "./config.js";
import { log } from "./shared/logger.js";

const main = async (): Promise<void> => {
  await connectMongo();
  await ensureMongoIndexes();
  initFirebaseAdmin();

  const app = createApp();
  app.listen(cfg.port, () => {
    log.info("vps_api_started", {
      port: cfg.port,
      node_env: cfg.nodeEnv
    });
  });
};

main().catch((err) => {
  log.error("vps_api_boot_failed", err);
  process.exit(1);
});
