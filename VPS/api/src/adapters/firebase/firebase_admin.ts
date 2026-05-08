import admin from "firebase-admin";
import jwt from "jsonwebtoken";
import { cfg } from "../../config.js";
import { log } from "../../shared/logger.js";

let initialized = false;
const FIREBASE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let certCache: { certs: Record<string, string>; expiresAtMs: number } | null = null;

const parseMaxAgeSec = (cacheControl: string | null): number => {
  if (!cacheControl) return 3600;
  const m = cacheControl.match(/max-age=(\d+)/i);
  if (!m) return 3600;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : 3600;
};

const getFirebaseCerts = async (forceRefresh = false): Promise<Record<string, string>> => {
  const now = Date.now();
  if (!forceRefresh && certCache && now < certCache.expiresAtMs) {
    return certCache.certs;
  }

  const response = await fetch(FIREBASE_CERTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Firebase certs: ${response.status}`);
  }

  const certs = (await response.json()) as Record<string, string>;
  const maxAgeSec = parseMaxAgeSec(response.headers.get("cache-control"));
  certCache = {
    certs,
    expiresAtMs: now + maxAgeSec * 1000 - 5000
  };
  return certs;
};

const extractKid = (idToken: string): string => {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === "string" || !decoded.header || typeof decoded.header.kid !== "string") {
    throw new Error("Invalid token header");
  }
  return decoded.header.kid;
};

const verifyFirebaseIdTokenManual = async (idToken: string): Promise<admin.auth.DecodedIdToken> => {
  if (!cfg.firebaseProjectId) {
    throw new Error("FIREBASE_PROJECT_ID is required when Firebase Admin credentials are unavailable");
  }

  const kid = extractKid(idToken);
  const issuer = `https://securetoken.google.com/${cfg.firebaseProjectId}`;

  let certs = await getFirebaseCerts(false);
  let cert = certs[kid];
  if (!cert) {
    certs = await getFirebaseCerts(true);
    cert = certs[kid];
  }
  if (!cert) {
    throw new Error("Unknown token signing key");
  }

  const payload = jwt.verify(idToken, cert, { algorithms: ["RS256"] }) as jwt.JwtPayload;
  const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
  const sub = payload.sub;
  const iss = payload.iss;

  if (aud !== cfg.firebaseProjectId) {
    throw new Error("Invalid token audience");
  }
  if (iss !== issuer) {
    throw new Error("Invalid token issuer");
  }
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid token subject");
  }

  const decoded: Partial<admin.auth.DecodedIdToken> = {
    uid: sub,
    sub,
    aud: aud ?? "",
    iss: iss ?? "",
    iat: typeof payload.iat === "number" ? payload.iat : 0,
    exp: typeof payload.exp === "number" ? payload.exp : 0,
    auth_time: typeof payload.auth_time === "number" ? payload.auth_time : 0,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined
  };

  return decoded as admin.auth.DecodedIdToken;
};

export const initFirebaseAdmin = (): void => {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return;
  }

  if (cfg.firebaseProjectId && cfg.firebaseClientEmail && cfg.firebasePrivateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: cfg.firebaseProjectId,
        clientEmail: cfg.firebaseClientEmail,
        privateKey: cfg.firebasePrivateKey
      })
    });
    initialized = true;
    log.info("firebase_initialized", { mode: "inline_service_account" });
    return;
  }

  try {
    admin.initializeApp();
    initialized = true;
    log.info("firebase_initialized", { mode: "default_credentials" });
  } catch (err) {
    log.warn("firebase_not_initialized", {
      reason: "credentials_missing",
      err
    });
  }
};

export const verifyFirebaseIdToken = async (idToken: string): Promise<admin.auth.DecodedIdToken> => {
  if (initialized || admin.apps.length > 0) {
    return admin.auth().verifyIdToken(idToken, true);
  }

  log.warn("firebase_admin_unavailable_fallback", {
    mode: "manual_jwt_verify",
    project_id_present: Boolean(cfg.firebaseProjectId)
  });
  return verifyFirebaseIdTokenManual(idToken);
};
