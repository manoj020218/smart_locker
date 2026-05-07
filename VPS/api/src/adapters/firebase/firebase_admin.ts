import admin from "firebase-admin";
import { cfg } from "../../config.js";
import { log } from "../../shared/logger.js";

let initialized = false;

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
  if (!initialized && admin.apps.length === 0) {
    throw new Error("Firebase Admin not initialized");
  }
  return admin.auth().verifyIdToken(idToken, true);
};
