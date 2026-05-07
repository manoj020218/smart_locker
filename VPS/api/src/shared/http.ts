import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";
import { log } from "./logger.js";

export const requestContext = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header("x-request-id");
  const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader("x-request-id", requestId);
  (req as Request & { requestId: string }).requestId = requestId;
  next();
};

export const asyncHandler =
  <TReq extends Request, TRes extends Response>(
    fn: (req: TReq, res: TRes, next: NextFunction) => Promise<void> | void
  ) =>
  (req: TReq, res: TRes, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = (req as Request & { requestId?: string }).requestId;
  if (err instanceof HttpError) {
    res.status(err.status).json({
      ok: false,
      error: err.code,
      message: err.message,
      details: err.details ?? null,
      request_id: requestId
    });
    return;
  }

  log.error("unhandled_error", {
    request_id: requestId,
    method: req.method,
    path: req.path,
    err
  });

  res.status(500).json({
    ok: false,
    error: "internal_error",
    message: "Internal server error",
    request_id: requestId
  });
};
