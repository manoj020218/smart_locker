import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { cfg } from "./config.js";
import { apkAdminRoutes, apkPublicRoutes } from "./modules/apk/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { cabinetRoutes } from "./modules/cabinet/routes.js";
import { licenseRoutes } from "./modules/license/routes.js";
import { logsRoutes } from "./modules/logs/routes.js";
import { manufacturerRoutes } from "./modules/manufacturer/routes.js";
import { otaRoutes } from "./modules/ota/routes.js";
import { syncRoutes } from "./modules/sync/routes.js";
import { notFound } from "./shared/errors.js";
import { errorHandler, requestContext } from "./shared/http.js";

morgan.token("request-id", (req) => (req as express.Request & { requestId?: string }).requestId ?? "-");

export const createApp = (): express.Express => {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);
  app.use(
    morgan(':method :url :status :response-time ms req_id=:request-id ua=":user-agent"', {
      skip: () => cfg.nodeEnv === "test"
    })
  );

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "smart-cabinet-vps-api",
      ts: Math.floor(Date.now() / 1000)
    });
  });

  app.use("/v1/auth", authRoutes);
  app.use("/v1/public/apk", apkPublicRoutes);
  app.use("/v1/device", syncRoutes);
  app.use("/v1/device", logsRoutes);
  app.use("/v1/device", licenseRoutes);
  app.use("/v1/device", otaRoutes);
  app.use("/v1/admin", cabinetRoutes);
  app.use("/v1/admin/apk", apkAdminRoutes);
  app.use("/v1/manufacturer", manufacturerRoutes);

  app.use((_req, _res, next) => {
    next(notFound("Route not found"));
  });

  app.use(errorHandler);

  return app;
};
