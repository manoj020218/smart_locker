/* eslint-disable no-console */
import { randomUUID } from "node:crypto";

type HttpMethod = "GET" | "POST";

const help = `
Manufacturer Demo Smoke Script

Usage:
  BASE_URL=http://127.0.0.1:8080 \\
  MFR_IDENTIFIER=mfr@example.com \\
  MFR_PASSWORD='StrongPass#2026' \\
  npm run smoke:manufacturer

Optional env:
  OWNER_EMAIL=owner.demo@example.com
  OWNER_PASSWORD='Owner#12345'
  CABINET_ID=cab-demo-001
  CABINET_NAME='Demo Cabinet'
  CABINET_LOCATION='Demo Site'
  CABINET_MODE=DEMO|COMMERCIAL
  FCM_TOKEN=fcm-demo-token-12345678901234567890
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(help.trim());
  process.exit(0);
}

const baseUrl = (process.env.BASE_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
const identifier = process.env.MFR_IDENTIFIER ?? "";
const password = process.env.MFR_PASSWORD ?? "";

if (!identifier || !password) {
  console.error("Missing required env: MFR_IDENTIFIER and MFR_PASSWORD");
  console.error(help.trim());
  process.exit(1);
}

const now = Date.now();
const ownerEmail = process.env.OWNER_EMAIL ?? `owner.demo.${now}@example.com`;
const ownerPassword = process.env.OWNER_PASSWORD ?? "Owner#12345";
const cabinetId = process.env.CABINET_ID ?? `cab-demo-${Math.floor(now / 1000)}`;
const cabinetName = process.env.CABINET_NAME ?? "Demo Cabinet";
const cabinetLocation = process.env.CABINET_LOCATION ?? "Demo Site";
const cabinetMode = process.env.CABINET_MODE ?? "DEMO";
const fcmToken = process.env.FCM_TOKEN ?? `fcm-demo-${randomUUID().replace(/-/g, "")}1234567890`;

const http = async <T>(
  method: HttpMethod,
  path: string,
  token?: string,
  body?: unknown
): Promise<{ status: number; json: T }> => {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = (await response.json()) as T;
  return { status: response.status, json };
};

const expectOk = <T>(status: number, payload: T, step: string): T => {
  if (status < 200 || status >= 300) {
    console.error(`Step failed: ${step}`);
    console.error(`HTTP ${status}`);
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
  return payload;
};

const main = async (): Promise<void> => {
  console.log(`Base URL: ${baseUrl}`);

  const loginRes = await http<{
    ok?: boolean;
    token?: string;
    profile?: { manufacturer_id?: string; user_id?: string };
  }>("POST", "/v1/auth/login", undefined, {
    identifier,
    password
  });
  const loginBody = expectOk(loginRes.status, loginRes.json, "login");
  const token = loginBody.token ?? "";
  if (!token) {
    console.error("Login response missing token");
    process.exit(1);
  }
  console.log("1) Login OK");

  const meRes = await http<{
    ok?: boolean;
    profile?: { role?: string; manufacturer_id?: string; user_id?: string };
  }>("GET", "/v1/auth/me", token);
  const meBody = expectOk(meRes.status, meRes.json, "me");
  const manufacturerId = meBody.profile?.manufacturer_id ?? "";
  if (!manufacturerId) {
    console.error("Current user missing manufacturer_id claim");
    process.exit(1);
  }
  console.log(`2) /me OK (manufacturer_id=${manufacturerId})`);

  const registerCabinetRes = await http<{ ok?: boolean }>("POST", "/v1/manufacturer/cabinets/register", token, {
    cabinet_id: cabinetId,
    cabinet_name: cabinetName,
    location_name: cabinetLocation,
    total_lockers: 24,
    mode: cabinetMode,
    access_modes: ["WIEGAND"]
  });
  expectOk(registerCabinetRes.status, registerCabinetRes.json, "register cabinet");
  console.log(`3) Cabinet registered (${cabinetId})`);

  const ownerCreateRes = await http<{
    ok?: boolean;
    owner_user_id?: string;
  }>("POST", "/v1/manufacturer/owners", token, {
    display_name: "Demo Owner",
    email: ownerEmail,
    password: ownerPassword,
    cabinet_ids: [cabinetId]
  });
  const ownerCreateBody = expectOk(ownerCreateRes.status, ownerCreateRes.json, "create owner");
  const ownerUserId = ownerCreateBody.owner_user_id ?? "";
  if (!ownerUserId) {
    console.error("Owner creation missing owner_user_id");
    process.exit(1);
  }
  console.log(`4) Owner created (${ownerUserId})`);

  const assignOwnerRes = await http<{ ok?: boolean }>(
    "POST",
    `/v1/manufacturer/cabinets/${encodeURIComponent(cabinetId)}/assign-owner`,
    token,
    {
      owner_user_id: ownerUserId
    }
  );
  expectOk(assignOwnerRes.status, assignOwnerRes.json, "assign owner");
  console.log("5) Owner assigned to cabinet");

  const dashboardRes = await http("GET", "/v1/manufacturer/dashboard", token);
  expectOk(dashboardRes.status, dashboardRes.json, "dashboard");
  console.log("6) Dashboard OK");

  const cabinetsRes = await http("GET", "/v1/manufacturer/cabinets", token);
  expectOk(cabinetsRes.status, cabinetsRes.json, "cabinets");
  console.log("7) Cabinets OK");

  const healthRes = await http("GET", "/v1/manufacturer/health?limit=20", token);
  expectOk(healthRes.status, healthRes.json, "health");
  console.log("8) Health OK");

  const usageRes = await http("GET", "/v1/manufacturer/usage?group_by=cabinet", token);
  expectOk(usageRes.status, usageRes.json, "usage");
  console.log("9) Usage OK");

  const ownersRes = await http("GET", "/v1/manufacturer/owners", token);
  expectOk(ownersRes.status, ownersRes.json, "owners");
  console.log("10) Owners list OK");

  const regFcmRes = await http("POST", "/v1/auth/register-fcm-token", token, {
    token: fcmToken
  });
  expectOk(regFcmRes.status, regFcmRes.json, "register fcm");
  console.log("11) Register FCM token OK");

  const remFcmRes = await http("POST", "/v1/auth/remove-fcm-token", token, {
    token: fcmToken
  });
  expectOk(remFcmRes.status, remFcmRes.json, "remove fcm");
  console.log("12) Remove FCM token OK");

  console.log("\nSmoke test complete.");
  console.log(
    JSON.stringify(
      {
        ok: true,
        manufacturer_id: manufacturerId,
        cabinet_id: cabinetId,
        owner_user_id: ownerUserId
      },
      null,
      2
    )
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
