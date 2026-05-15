import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { SmartLockerApiClient } from "../api/client";
import { BleProvisionClient, type BleDiscoveredDevice } from "../ble/provision";
import { LabeledInput } from "../components/LabeledInput";
import type { AppSession } from "../types/api";

type Props = {
  session: AppSession;
};

type ProvisionStep = "idle" | "running" | "done" | "failed";

type LocalHealth = {
  ok: boolean;
  device_id?: string;
  ip?: string;
  hostname?: string;
  cabinet_id_2d?: string;
  cabinet_name?: string;
  cabinet_location?: string;
  drawer_count?: number;
  board?: number;
  control_cards?: number;
  locks_per_card?: number;
  configured_max_lockers?: number;
  max_supported_lockers?: number;
  ops_method?: string;
  ops_strategy?: string;
  ops_fixed_drawer?: number;
  ops_wg_access?: string;
  ops_locker_intent?: string;
  ops_allow_uses_type?: number;
  tx_count?: number;
  wg_events?: number;
};

type LocalCabinetMeta = {
  ok: boolean;
  meta?: {
    cabinet_id_2d?: string;
    cabinet_name?: string;
    cabinet_location?: string;
    drawer_count?: number;
    board?: number;
    control_cards?: number;
    locks_per_card?: number;
    configured_max_lockers?: number;
    max_supported_lockers?: number;
  };
};

type LocalOpsMode = {
  ok: boolean;
  mode?: {
    method?: string;
    drawer_strategy?: string;
    fixed_drawer_id?: number;
    identity_mode?: string;
    wg_access_mode?: string;
    locker_intent?: string;
    allow_uses_type?: number;
  };
};

type LocalWiegandLatest = {
  has_event?: boolean;
  event?: {
    sequence?: number;
    bits?: number;
    source?: string;
    card_id?: string;
    raw_hex?: string;
    captured_ms?: number;
  };
};

type LocalWiegandRecent = {
  count?: number;
  events?: Array<{
    sequence?: number;
    bits?: number;
    source?: string;
    card_id?: string;
    raw_hex?: string;
    captured_ms?: number;
  }>;
};

type LocalTxRecent = {
  count?: number;
  events?: Array<{
    sequence?: number;
    action?: string;
    time_hms?: string;
    user_ref?: string;
    board?: number;
    lock?: number;
    source?: string;
    protocol_code?: string;
  }>;
};

type LocalSyncStatus = {
  ok?: boolean;
  device_id?: string;
  cabinet_id?: string;
  tenant_id?: string;
};

type LocalDwReply = {
  ok?: boolean;
  board?: number;
  cmd?: number;
  error?: string;
  tx_hex?: string;
  rx_hex?: string;
  data_hex?: string;
  data_len?: number;
  bitmap_bits?: string;
  version?: string;
};

type LocalRsScan = {
  ok?: boolean;
  detected_board_count?: number;
  detected_boards?: number[];
  locks_per_card?: number;
  estimated_max_lockers?: number;
  max_supported_lockers?: number;
  results?: Array<{
    board?: number;
    ok?: boolean;
    error?: string;
    tx_hex?: string;
    rx_hex?: string;
    version?: string;
  }>;
};

type OptionItem = {
  label: string;
  value: string;
};

type FieldErrorMap = Partial<Record<"deviceId" | "cabinetId" | "tenantId" | "serviceUuid" | "characteristicUuid" | "scanTimeoutSec", string>>;

type SavedProvisionTarget = {
  deviceId: string;
  deviceName: string;
  cabinetId: string;
  tenantId: string;
  hwModel: string;
  fwVersion: string;
  localBaseUrl: string;
  updatedAtIso: string;
  source?: "cloud" | "ble" | "local";
  healthStatus?: string;
};

const BLE_TARGET_STORE_KEY = "smart_cabinet_ble_targets_v1";

const OPS_METHOD_OPTIONS: OptionItem[] = [
  { label: "QR", value: "qr" },
  { label: "WG Machine", value: "wg_machine" },
  { label: "QR + Password", value: "qr_password" },
  { label: "Admin Emergency", value: "admin_emergency" }
];

const DRAWER_STRATEGY_OPTIONS: OptionItem[] = [
  { label: "Sequence", value: "sequence" },
  { label: "Random", value: "random" },
  { label: "Fixed", value: "fixed" },
  { label: "Reuse Last", value: "reuse_last" }
];

const WG_ACCESS_OPTIONS: OptionItem[] = [
  { label: "Free Card", value: "free_card" },
  { label: "Restricted", value: "restricted" }
];

const LOCKER_INTENT_OPTIONS: OptionItem[] = [
  { label: "AUTO", value: "auto" },
  { label: "PUT", value: "put" },
  { label: "WITHDRAW", value: "withdraw" }
];

const IDENTITY_MODE_OPTIONS: OptionItem[] = [
  { label: "Phone + OTP", value: "phone_otp" },
  { label: "Member ID", value: "member_id" },
  { label: "Session Token", value: "session_token" }
];

export const BleProvisionScreen = ({ session }: Props): React.JSX.Element => {
  const provisionedDeviceUrl = "http://smart-cabinet-c3.local/";
  const [deviceId, setDeviceId] = useState("");
  const [cabinetId, setCabinetId] = useState("");
  const [tenantId, setTenantId] = useState(session.tenantId || "");
  const [hwModel, setHwModel] = useState("esp32-c3");
  const [fwVersion, setFwVersion] = useState("1.0.0");
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [provisionKey, setProvisionKey] = useState("");

  const [targetDeviceId, setTargetDeviceId] = useState("");
  const [targetNamePrefix, setTargetNamePrefix] = useState("");
  const [serviceUuid, setServiceUuid] = useState("0000ff00-0000-1000-8000-00805f9b34fb");
  const [characteristicUuid, setCharacteristicUuid] = useState("0000ff01-0000-1000-8000-00805f9b34fb");
  const [scanTimeoutSec, setScanTimeoutSec] = useState("12");

  const [step, setStep] = useState<ProvisionStep>("idle");
  const [note, setNote] = useState("Configure payload and run BLE provisioning.");
  const [scanResults, setScanResults] = useState<BleDiscoveredDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [provisionOk, setProvisionOk] = useState(false);
  const [localFlowUnlocked, setLocalFlowUnlocked] = useState(false);
  const [hideProvisionForms, setHideProvisionForms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [verifiedDeviceName, setVerifiedDeviceName] = useState("");
  const [provisionedTargets, setProvisionedTargets] = useState<SavedProvisionTarget[]>([]);
  const [activeBleAction, setActiveBleAction] = useState("");

  const [localBaseUrl, setLocalBaseUrl] = useState(provisionedDeviceUrl.replace(/\/+$/, ""));
  const [localBusyAction, setLocalBusyAction] = useState("");
  const [localError, setLocalError] = useState("");
  const [localFlash, setLocalFlash] = useState("");
  const [localPageVisible, setLocalPageVisible] = useState(false);
  const [localPageUrl, setLocalPageUrl] = useState(provisionedDeviceUrl.replace(/\/+$/, ""));

  const [localHealth, setLocalHealth] = useState<LocalHealth | null>(null);
  const [localCabinetMeta, setLocalCabinetMeta] = useState<LocalCabinetMeta["meta"] | null>(null);
  const [localOpsMode, setLocalOpsMode] = useState<LocalOpsMode["mode"] | null>(null);
  const [localWgLatest, setLocalWgLatest] = useState<LocalWiegandLatest | null>(null);
  const [localWgRecent, setLocalWgRecent] = useState<LocalWiegandRecent | null>(null);
  const [localTxRecent, setLocalTxRecent] = useState<LocalTxRecent | null>(null);

  const [layoutCabinetId2d, setLayoutCabinetId2d] = useState("01");
  const [layoutCabinetName, setLayoutCabinetName] = useState("Smart Cabinet");
  const [layoutCabinetLocation, setLayoutCabinetLocation] = useState("LAN");
  const [layoutDrawerCount, setLayoutDrawerCount] = useState("24");
  const [layoutBoard, setLayoutBoard] = useState("0");
  const [layoutControlCards, setLayoutControlCards] = useState("1");
  const [layoutLocksPerCard, setLayoutLocksPerCard] = useState("24");

  const [opsMethod, setOpsMethod] = useState("qr");
  const [opsDrawerStrategy, setOpsDrawerStrategy] = useState("sequence");
  const [opsFixedDrawerId, setOpsFixedDrawerId] = useState("1");
  const [opsIdentityMode, setOpsIdentityMode] = useState("phone_otp");
  const [opsWgAccessMode, setOpsWgAccessMode] = useState("free_card");
  const [opsLockerIntent, setOpsLockerIntent] = useState("auto");
  const [opsAllowUsesType, setOpsAllowUsesType] = useState("1");

  const [openBoard, setOpenBoard] = useState("0");
  const [openLockAddr, setOpenLockAddr] = useState("0");
  const [openIntent, setOpenIntent] = useState("auto");
  const [openUserRef, setOpenUserRef] = useState("");

  const [queryBoard, setQueryBoard] = useState("0");
  const [openResult, setOpenResult] = useState("No command yet.");
  const [queryResult, setQueryResult] = useState("No query yet.");
  const [scanBoardInfo, setScanBoardInfo] = useState("No scan yet.");
  const [drawerOpenFlags, setDrawerOpenFlags] = useState<boolean[]>([]);
  const [livePulse, setLivePulse] = useState(false);

  const payload = useMemo(
    () => ({
      transport: "ble",
      api_base_url: session.baseUrl,
      device_register: {
        device_id: deviceId.trim(),
        cabinet_id: cabinetId.trim(),
        tenant_id: tenantId.trim(),
        hw_model: hwModel.trim(),
        fw_version: fwVersion.trim(),
        x_provision_key: provisionKey.trim() || "<set-on-device-or-admin>",
        require_register: true
      },
      wifi: {
        ssid: wifiSsid.trim(),
        password: wifiPassword
      },
      meta: {
        generated_by: "admin-apk-ble-live",
        generated_at: new Date().toISOString()
      }
    }),
    [session.baseUrl, deviceId, cabinetId, tenantId, hwModel, fwVersion, provisionKey, wifiSsid, wifiPassword]
  );

  const running = step === "running";
  const busy = running || scanning || verifying;
  const localBusy = localBusyAction.length > 0;
  const localReady = provisionOk || localFlowUnlocked;

  const normalizeLocalBaseUrl = (value: string): string => {
    const raw = value.trim();
    if (!raw) return "";
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
    return withScheme.replace(/\/+$/, "");
  };

  const asPositiveInt = (value: string, fallback: number): number => {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };

  const parseDataHex = (dataHex?: string): number[] => {
    if (!dataHex) return [];
    return dataHex
      .split(" ")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => Number.parseInt(part, 16))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 255);
  };

  const lockClosed = (bytes: number[], lockAddr: number): boolean => {
    const byteIdx = Math.floor(lockAddr / 8);
    const bitIdx = lockAddr % 8;
    if (byteIdx < 0 || byteIdx >= bytes.length) return true;
    return ((bytes[byteIdx] >> bitIdx) & 1) === 1;
  };

  const isUuidFormat = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());

  const inferHwModel = (deviceName: string): string => {
    const raw = deviceName.trim().toLowerCase();
    if (!raw) return "esp32-c3";
    if (raw.includes("c3")) return "esp32-c3";
    if (raw.includes("s3")) return "esp32-s3";
    if (raw.includes("esp32")) return "esp32";
    return "esp32-c3";
  };

  const inferFwVersion = (deviceName: string, fallbackVersion: string): string => {
    const raw = deviceName.trim();
    const match = raw.match(/\b(v?\d+\.\d+\.\d+)\b/i);
    if (match && match[1]) {
      return match[1].toLowerCase().startsWith("v") ? match[1].slice(1) : match[1];
    }
    return fallbackVersion.trim() || "1.0.0";
  };

  const validateProvisionInputs = (): FieldErrorMap => {
    const next: FieldErrorMap = {};
    if (!deviceId.trim()) {
      next.deviceId = "Device ID is required (from verified target).";
    }
    if (!cabinetId.trim()) {
      next.cabinetId = "Cabinet ID is required.";
    }
    if (!tenantId.trim()) {
      next.tenantId = "Tenant ID is required.";
    }
    if (!serviceUuid.trim()) {
      next.serviceUuid = "Service UUID is required.";
    } else if (!isUuidFormat(serviceUuid)) {
      next.serviceUuid = "Service UUID format is invalid.";
    }
    if (!characteristicUuid.trim()) {
      next.characteristicUuid = "Characteristic UUID is required.";
    } else if (!isUuidFormat(characteristicUuid)) {
      next.characteristicUuid = "Characteristic UUID format is invalid.";
    }
    const timeout = Number.parseInt(scanTimeoutSec.trim(), 10);
    if (!Number.isInteger(timeout) || timeout < 3 || timeout > 120) {
      next.scanTimeoutSec = "Scan timeout must be between 3 and 120 seconds.";
    }
    return next;
  };

  const showActionAlert = (title: string, message: string): void => {
    Alert.alert(title, message, [{ text: "OK", style: "default" }], { cancelable: true });
  };

  const recordProvisionedTarget = async (target: SavedProvisionTarget): Promise<void> => {
    const merged = [target, ...provisionedTargets.filter((item) => item.deviceId !== target.deviceId)].slice(0, 12);
    setProvisionedTargets(merged);
    await AsyncStorage.setItem(BLE_TARGET_STORE_KEY, JSON.stringify(merged));
  };

  const discoverProvisionedTargets = async (): Promise<void> => {
    setActiveBleAction("discover_targets");
    setLocalBusyAction("Discovering provisioned devices");
    setLocalError("");
    setLocalFlash("");

    try {
      const byId = new Map<string, SavedProvisionTarget>();
      for (const existing of provisionedTargets) {
        byId.set(existing.deviceId, existing);
      }

      let cloudCount = 0;
      let bleCount = 0;
      let localCount = 0;
      let localProbeError = "";

      try {
        const api = new SmartLockerApiClient(session.baseUrl, session.token);
        const cloud = await api.cabinets();
        for (const row of cloud.cabinets ?? []) {
          const id = (row.device_id || "").trim();
          if (!id) continue;
          cloudCount += 1;
          byId.set(id, {
            deviceId: id,
            deviceName: row.cabinet_name || id,
            cabinetId: row.cabinet_id || "",
            tenantId: session.tenantId || "",
            hwModel: byId.get(id)?.hwModel || "esp32-c3",
            fwVersion: row.firmware_version || byId.get(id)?.fwVersion || "1.0.0",
            localBaseUrl: byId.get(id)?.localBaseUrl || provisionedDeviceUrl.replace(/\/+$/, ""),
            updatedAtIso: new Date().toISOString(),
            source: "cloud",
            healthStatus: row.health_status
          });
        }
      } catch {
        // Continue with BLE discovery if cloud call is unavailable.
      }

      const bleClient = new BleProvisionClient();
      try {
        const bleDevices = await bleClient.scanNearbyDevices({
          targetNamePrefix: targetNamePrefix.trim() || "smart-cabinet",
          scanTimeoutMs: 8000,
          onProgress: (_phase, message) => setNote(message)
        });
        for (const dev of bleDevices) {
          const id = (dev.id || "").trim();
          if (!id) continue;
          bleCount += 1;
          const prev = byId.get(id);
          byId.set(id, {
            deviceId: id,
            deviceName: dev.name || prev?.deviceName || id,
            cabinetId: prev?.cabinetId || cabinetId.trim(),
            tenantId: prev?.tenantId || tenantId.trim() || session.tenantId || "",
            hwModel: prev?.hwModel || inferHwModel(dev.name || ""),
            fwVersion: prev?.fwVersion || inferFwVersion(dev.name || "", fwVersion),
            localBaseUrl: prev?.localBaseUrl || normalizeLocalBaseUrl(localBaseUrl) || provisionedDeviceUrl.replace(/\/+$/, ""),
            updatedAtIso: new Date().toISOString(),
            source: "ble",
            healthStatus: prev?.healthStatus
          });
        }
      } finally {
        bleClient.destroy();
      }

      try {
        const health = await localRequest<LocalHealth>("/api/health");
        let syncStatus: LocalSyncStatus | null = null;
        try {
          syncStatus = await localRequest<LocalSyncStatus>("/api/sync/status");
        } catch {
          syncStatus = null;
        }
        const localId =
          (syncStatus?.device_id || "").trim() ||
          (health.device_id || "").trim() ||
          deviceId.trim() ||
          targetDeviceId.trim() ||
          (health.hostname || "").trim() ||
          "local-device";
        const prev = byId.get(localId);
        const detectedBaseFromHealth = health.ip ? normalizeLocalBaseUrl(`http://${health.ip}`) : "";
        const resolvedLocalBase =
          detectedBaseFromHealth || prev?.localBaseUrl || normalizeLocalBaseUrl(localBaseUrl) || provisionedDeviceUrl.replace(/\/+$/, "");
        byId.set(localId, {
          deviceId: localId,
          deviceName: health.cabinet_name || health.hostname || prev?.deviceName || localId,
          cabinetId: syncStatus?.cabinet_id || health.cabinet_id_2d || prev?.cabinetId || cabinetId.trim(),
          tenantId: syncStatus?.tenant_id || prev?.tenantId || tenantId.trim() || session.tenantId || "",
          hwModel: prev?.hwModel || hwModel.trim() || "esp32-c3",
          fwVersion: prev?.fwVersion || fwVersion.trim() || "1.0.0",
          localBaseUrl: resolvedLocalBase,
          updatedAtIso: new Date().toISOString(),
          source: "local",
          healthStatus: health.ok ? "online" : prev?.healthStatus
        });
        localCount += 1;
      } catch (err) {
        localProbeError = err instanceof Error ? err.message : "Local probe failed.";
      }

      const merged = Array.from(byId.values()).slice(0, 24);
      setProvisionedTargets(merged);
      await AsyncStorage.setItem(BLE_TARGET_STORE_KEY, JSON.stringify(merged));
      if (merged.length > 0) {
        setLocalFlowUnlocked(true);
      }
      const msg = `Found ${merged.length} device(s). Cloud: ${cloudCount}, BLE: ${bleCount}, Local: ${localCount}.`;
      setLocalFlash(msg);
      if (localCount === 0 && localProbeError) {
        const localHint = `${msg}\nLocal probe failed: ${localProbeError}`;
        setLocalError(localHint);
        showActionAlert("MFGR Discover", localHint);
      } else {
        showActionAlert("MFGR Discover", msg);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Device discovery failed";
      setLocalError(message);
      showActionAlert("MFGR Discover Failed", message);
    } finally {
      setLocalBusyAction("");
      setActiveBleAction("");
    }
  };

  const applySavedTarget = (target: SavedProvisionTarget): void => {
    setTargetDeviceId(target.deviceId);
    setDeviceId(target.deviceId);
    setCabinetId(target.cabinetId);
    setTenantId(target.tenantId);
    setHwModel(target.hwModel || "esp32-c3");
    setFwVersion(target.fwVersion || "1.0.0");
    setVerifiedDeviceName(target.deviceName || target.deviceId);
    setProvisionOk(true);
    setLocalFlowUnlocked(true);
    setHideProvisionForms(true);
    setFieldErrors({});
    setNote(`Loaded provisioned target ${target.deviceId}. Continue MFGR post-BLE flow.`);
  };

  const buttonStyle = (base: object, disabled = false) =>
    ({ pressed }: { pressed: boolean }): Array<object | undefined> => [
      base,
      disabled ? styles.buttonDisabled : undefined,
      pressed && !disabled ? styles.buttonPressed : undefined
    ];

  const actionButtonContent = (busyNow: boolean, text: string): React.JSX.Element =>
    busyNow ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>{text}</Text>;

  const extractErrorMessage = (payload: unknown, fallback: string): string => {
    if (typeof payload === "object" && payload !== null) {
      const candidate = payload as { message?: unknown; error?: unknown; raw?: unknown };
      if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
      if (typeof candidate.error === "string" && candidate.error.trim()) return candidate.error;
      if (typeof candidate.raw === "string" && candidate.raw.trim()) return candidate.raw;
    }
    return fallback;
  };

  const isLikelyLocalNetworkError = (message: string): boolean => {
    const lower = message.toLowerCase();
    return (
      lower.includes("network request failed") ||
      lower.includes("failed to fetch") ||
      lower.includes("timed out") ||
      lower.includes("abort")
    );
  };

  const buildLocalBaseCandidates = (seedBase: string): string[] => {
    const candidates: string[] = [];
    const pushCandidate = (value: string): void => {
      const normalized = normalizeLocalBaseUrl(value);
      if (!normalized || candidates.includes(normalized)) {
        return;
      }
      candidates.push(normalized);
    };

    const primary = normalizeLocalBaseUrl(seedBase);
    pushCandidate(primary);
    pushCandidate("http://smart-cabinet-c3.local");
    pushCandidate("http://192.168.4.1");
    return candidates;
  };

  const fetchLocalJson = async <T,>(base: string, path: string, init: RequestInit = {}): Promise<T> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        signal: controller.signal
      });
      const text = await response.text();
      let parsed: unknown = {};
      if (text) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          throw new Error(`Invalid JSON from device on ${path}`);
        }
      }
      if (!response.ok) {
        const hint = extractErrorMessage(parsed, `HTTP ${response.status}`);
        throw new Error(`Device API ${path} failed: ${hint}`);
      }
      return parsed as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isLikelyLocalNetworkError(message)) {
        throw new Error(`Network request failed on ${base}${path}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  };

  const localRequest = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const primaryBase = normalizeLocalBaseUrl(localBaseUrl);
    if (!primaryBase) {
      throw new Error("Device URL is required.");
    }

    const candidates = buildLocalBaseCandidates(primaryBase);

    let lastNetworkError = "";
    for (const base of candidates) {
      try {
        const parsed = await fetchLocalJson<T>(base, path, init);
        return parsed;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isLikelyLocalNetworkError(message)) {
          lastNetworkError = message;
          continue;
        }
        throw err;
      }
    }

    if (lastNetworkError) {
      throw new Error(
        `Network request failed. Tried: ${candidates.join(", ")}. Connect phone to same Wi-Fi/AP as cabinet, then set Device URL (AP mode: http://192.168.4.1).`
      );
    }
    throw new Error("Device request failed.");
  };

  const runLocalAction = async (
    label: string,
    task: () => Promise<void>,
    options: { announceSuccess?: boolean; announceError?: boolean } = {}
  ): Promise<void> => {
    const announceSuccess = options.announceSuccess ?? true;
    const announceError = options.announceError ?? true;
    setLocalBusyAction(label);
    setLocalError("");
    setLocalFlash("");
    try {
      await task();
      if (announceSuccess) {
        showActionAlert(label, "Completed successfully.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : `${label} failed`;
      setLocalError(message);
      if (announceError) {
        showActionAlert(`${label} failed`, message);
      }
    } finally {
      setLocalBusyAction("");
    }
  };

  const applyMetaToForm = (meta?: LocalCabinetMeta["meta"]): void => {
    if (!meta) return;
    setLayoutCabinetId2d(meta.cabinet_id_2d || "01");
    setLayoutCabinetName(meta.cabinet_name || "Smart Cabinet");
    setLayoutCabinetLocation(meta.cabinet_location || "LAN");
    setLayoutDrawerCount(String(meta.drawer_count ?? 24));
    setLayoutBoard(String(meta.board ?? 0));
    setLayoutControlCards(String(meta.control_cards ?? 1));
    setLayoutLocksPerCard(String(meta.locks_per_card ?? 24));
    setOpenBoard(String(meta.board ?? 0));
    setQueryBoard(String(meta.board ?? 0));
  };

  const applyOpsToForm = (mode?: LocalOpsMode["mode"]): void => {
    if (!mode) return;
    setOpsMethod(mode.method || "qr");
    setOpsDrawerStrategy(mode.drawer_strategy || "sequence");
    setOpsFixedDrawerId(String(mode.fixed_drawer_id ?? 1));
    setOpsIdentityMode(mode.identity_mode || "phone_otp");
    setOpsWgAccessMode(mode.wg_access_mode || "free_card");
    setOpsLockerIntent(mode.locker_intent || "auto");
    setOpsAllowUsesType(String(mode.allow_uses_type ?? 1));
    setOpenIntent(mode.locker_intent || "auto");
  };

  const refreshHealth = async (): Promise<LocalHealth> => {
    const health = await localRequest<LocalHealth>("/api/health");
    setLocalHealth(health);
    return health;
  };

  const refreshCabinetMeta = async (): Promise<LocalCabinetMeta["meta"]> => {
    const response = await localRequest<LocalCabinetMeta>("/api/cabinet/meta");
    setLocalCabinetMeta(response.meta ?? null);
    applyMetaToForm(response.meta);
    return response.meta;
  };

  const refreshOpsMode = async (): Promise<LocalOpsMode["mode"]> => {
    const response = await localRequest<LocalOpsMode>("/api/ops/mode");
    setLocalOpsMode(response.mode ?? null);
    applyOpsToForm(response.mode);
    return response.mode;
  };

  const refreshWiegand = async (): Promise<void> => {
    const [latest, recent] = await Promise.all([
      localRequest<LocalWiegandLatest>("/api/wg/latest"),
      localRequest<LocalWiegandRecent>("/api/wg/recent")
    ]);
    setLocalWgLatest(latest);
    setLocalWgRecent(recent);
  };

  const refreshTransactions = async (): Promise<void> => {
    const recent = await localRequest<LocalTxRecent>("/api/tx/recent?limit=100");
    setLocalTxRecent(recent);
  };

  const refreshStatusForLayout = async (silent = false): Promise<void> => {
    const board = Number.parseInt(queryBoard.trim(), 10);
    if (!Number.isInteger(board) || board < 0) {
      if (!silent) {
        throw new Error("Query board must be a non-negative number.");
      }
      return;
    }
    const reply = await localRequest<LocalDwReply>(`/api/rs485/lock-status?board=${encodeURIComponent(String(board))}`);
    if (!silent) {
      setQueryResult(JSON.stringify(reply, null, 2));
    }
    const bytes = parseDataHex(reply.data_hex);
    const drawers = asPositiveInt(layoutDrawerCount, 24);
    const flags: boolean[] = [];
    for (let idx = 0; idx < drawers; idx += 1) {
      const closed = lockClosed(bytes, idx);
      flags.push(!closed);
    }
    setDrawerOpenFlags(flags);
  };

  const refreshLocalDashboard = async (announce = true): Promise<void> => {
    await runLocalAction(
      "Refreshing local dashboard",
      async () => {
        await refreshHealth();
        await refreshCabinetMeta();
        await refreshOpsMode();
        await Promise.all([refreshWiegand(), refreshTransactions()]);
        await refreshStatusForLayout(true);
        setLocalFlash("Device dashboard refreshed.");
      },
      { announceSuccess: announce, announceError: announce }
    );
  };

  const saveCabinetLayout = async (): Promise<void> => {
    await runLocalAction("Saving cabinet layout", async () => {
      const params = new URLSearchParams();
      params.set("cabinet_id", layoutCabinetId2d.trim() || "01");
      params.set("name", layoutCabinetName.trim() || "Smart Cabinet");
      params.set("location", layoutCabinetLocation.trim() || "LAN");
      params.set("drawers", String(asPositiveInt(layoutDrawerCount, 24)));
      params.set("board", String(Math.max(0, Number.parseInt(layoutBoard.trim(), 10) || 0)));
      params.set("control_cards", String(asPositiveInt(layoutControlCards, 1)));
      params.set("locks_per_card", String(asPositiveInt(layoutLocksPerCard, 24)));
      await localRequest<LocalCabinetMeta>(`/api/cabinet/meta?${params.toString()}`, { method: "POST" });
      await refreshCabinetMeta();
      await refreshStatusForLayout(true);
      setLocalFlash("Cabinet layout saved.");
    });
  };

  const autoDetectLayout = async (): Promise<void> => {
    await runLocalAction("Auto detecting RS485 layout", async () => {
      const locksPerCard = asPositiveInt(layoutLocksPerCard, 24);
      const params = new URLSearchParams();
      params.set("locks_per_card", String(locksPerCard));
      const data = await localRequest<LocalRsScan>(`/api/rs485/auto-layout?${params.toString()}`, { method: "POST" });
      await refreshCabinetMeta();
      await refreshStatusForLayout(true);
      setScanBoardInfo(
        `Auto layout applied | Detected cards: ${data.detected_board_count ?? 0} | Max lockers: ${
          data.max_supported_lockers ?? 0
        }`
      );
      setLocalFlash("Auto layout applied from RS485 scan.");
    });
  };

  const saveOpsMode = async (): Promise<void> => {
    await runLocalAction("Saving operation mode", async () => {
      const params = new URLSearchParams();
      params.set("method", opsMethod);
      params.set("drawer_strategy", opsDrawerStrategy);
      params.set("fixed_drawer_id", String(asPositiveInt(opsFixedDrawerId, 1)));
      params.set("identity_mode", opsIdentityMode);
      params.set("wg_access_mode", opsWgAccessMode);
      params.set("locker_intent", opsLockerIntent);
      params.set("allow_uses_type", String(asPositiveInt(opsAllowUsesType, 1)));
      await localRequest<LocalOpsMode>(`/api/ops/mode?${params.toString()}`, { method: "POST" });
      await refreshOpsMode();
      setLocalFlash("Operation mode saved on device.");
    });
  };

  const queryVersion = async (): Promise<void> => {
    await runLocalAction("Querying RS485 version", async () => {
      const board = Math.max(0, Number.parseInt(queryBoard.trim(), 10) || 0);
      const reply = await localRequest<LocalDwReply>(`/api/rs485/version?board=${encodeURIComponent(String(board))}`);
      setQueryResult(JSON.stringify(reply, null, 2));
      setLocalFlash("Version query completed.");
    });
  };

  const queryInfrared = async (): Promise<void> => {
    await runLocalAction("Querying RS485 infrared", async () => {
      const board = Math.max(0, Number.parseInt(queryBoard.trim(), 10) || 0);
      const reply = await localRequest<LocalDwReply>(`/api/rs485/ir-status?board=${encodeURIComponent(String(board))}`);
      setQueryResult(JSON.stringify(reply, null, 2));
      setLocalFlash("Infrared query completed.");
    });
  };

  const queryLockStatus = async (): Promise<void> => {
    await runLocalAction("Querying RS485 lock status", async () => {
      await refreshStatusForLayout(false);
      setLocalFlash("Lock status refreshed.");
    });
  };

  const scanBoards = async (): Promise<void> => {
    await runLocalAction("Scanning RS485 boards", async () => {
      const scan = await localRequest<LocalRsScan>("/api/rs485/scan");
      setQueryResult(JSON.stringify(scan, null, 2));
      const detected = scan.results?.find((item) => item.ok);
      if (detected && detected.board !== undefined) {
        const boardText = String(detected.board);
        setLayoutBoard(boardText);
        setOpenBoard(boardText);
        setQueryBoard(boardText);
      }
      if (scan.detected_board_count !== undefined || scan.estimated_max_lockers !== undefined) {
        setScanBoardInfo(
          `Detected cards: ${scan.detected_board_count ?? 0} | Estimated max lockers: ${scan.estimated_max_lockers ?? 0}`
        );
      } else {
        setScanBoardInfo("No board reply in scan.");
      }
      setLocalFlash("RS485 board scan complete.");
    });
  };

  const openSingleLock = async (): Promise<void> => {
    await runLocalAction("Opening single lock", async () => {
      const board = Math.max(0, Number.parseInt(openBoard.trim(), 10) || 0);
      const lock = Math.max(0, Number.parseInt(openLockAddr.trim(), 10) || 0);
      const params = new URLSearchParams();
      params.set("board", String(board));
      params.set("lock", String(lock));
      params.set("intent", openIntent || "auto");
      if (openUserRef.trim()) {
        params.set("user", openUserRef.trim());
      }
      const reply = await localRequest<LocalDwReply>(`/api/rs485/open?${params.toString()}`, { method: "POST" });
      setOpenResult(JSON.stringify(reply, null, 2));
      await refreshStatusForLayout(true);
      await refreshTransactions();
      setLocalFlash("Single lock command sent.");
    });
  };

  useEffect(() => {
    const loadSavedTargets = async (): Promise<void> => {
      try {
        const raw = await AsyncStorage.getItem(BLE_TARGET_STORE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as SavedProvisionTarget[];
        if (!Array.isArray(parsed)) return;
        const clean = parsed.filter((item) => typeof item?.deviceId === "string" && item.deviceId.trim().length > 0);
        setProvisionedTargets(clean);
      } catch {
        // Ignore malformed local cache.
      }
    };
    void loadSavedTargets();
  }, []);

  useEffect(() => {
    if (!localReady) {
      return undefined;
    }
    void refreshLocalDashboard(false);
    return undefined;
  }, [localReady]);

  useEffect(() => {
    if (!localReady) {
      return undefined;
    }
    const interval = setInterval(() => {
      if (localBusyAction || localPageVisible) {
        return;
      }
      void Promise.allSettled([refreshHealth(), refreshWiegand(), refreshTransactions(), refreshStatusForLayout(true)]);
    }, 3500);
    return () => clearInterval(interval);
  }, [localReady, localBaseUrl, queryBoard, layoutDrawerCount, localBusyAction, localPageVisible]);

  useEffect(() => {
    if (!localReady) {
      return undefined;
    }
    const interval = setInterval(() => {
      setLivePulse((value) => !value);
    }, 700);
    return () => clearInterval(interval);
  }, [localReady]);

  const selectScannedDevice = (device: BleDiscoveredDevice): void => {
    setTargetDeviceId(device.id);
    setFieldErrors((prev) => ({ ...prev, deviceId: undefined }));
    setNote(`Selected target device: ${device.name} (${device.id})`);
    if (step === "failed") setStep("idle");
  };

  const runBleScan = async (): Promise<void> => {
    setActiveBleAction("scan");
    setScanning(true);
    setStep("idle");
    setNote("Preparing BLE scan...");
    const client = new BleProvisionClient();
    try {
      const timeoutMs = Math.max(3, Number.parseInt(scanTimeoutSec || "12", 10) || 12) * 1000;
      const devices = await client.scanNearbyDevices({
        targetNamePrefix: targetNamePrefix.trim() || undefined,
        scanTimeoutMs: timeoutMs,
        onProgress: (_phase, message) => setNote(message)
      });
      setScanResults(devices);
      if (devices.length === 0) {
        setStep("failed");
        setNote("No BLE devices found. Keep target device advertising and try scan again.");
        showActionAlert("BLE Scan", "No BLE devices found. Keep target device advertising and scan again.");
        return;
      }
      setStep("done");
      setNote(`Found ${devices.length} BLE device(s). Tap one below to set it as target.`);
      showActionAlert("BLE Scan", `Found ${devices.length} device(s). Select your target.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "BLE scan failed";
      setStep("failed");
      setNote(message);
      setScanResults([]);
      showActionAlert("BLE Scan Failed", message);
    } finally {
      client.destroy();
      setScanning(false);
      setActiveBleAction("");
    }
  };

  const verifySelectedDevice = async (): Promise<void> => {
    const device = targetDeviceId.trim();
    if (!device) {
      setStep("failed");
      setNote("Select a device from scan results first.");
      showActionAlert("Verify Target", "Select a device from scan results first.");
      return;
    }
    if (!serviceUuid.trim() || !characteristicUuid.trim()) {
      setStep("failed");
      setNote("BLE service UUID and characteristic UUID are required.");
      showActionAlert("Verify Target", "BLE service UUID and characteristic UUID are required.");
      return;
    }

    setActiveBleAction("verify");
    setVerifying(true);
    setStep("idle");
    setNote("Verifying selected BLE device...");
    const client = new BleProvisionClient();
    try {
      const result = await client.probeDevice({
        targetDeviceId: device,
        serviceUuid,
        characteristicUuid,
        onProgress: (_phase, message) => setNote(message)
      });
      if (!result.hasService) {
        setStep("failed");
        setNote(`Connected to ${result.deviceName}, but required service UUID not found.`);
        showActionAlert("Verify Failed", `Connected to ${result.deviceName}, but required service UUID not found.`);
        return;
      }
      if (!result.hasCharacteristic) {
        setStep("failed");
        setNote(`Service found on ${result.deviceName}, but characteristic UUID not found.`);
        showActionAlert("Verify Failed", `Service found on ${result.deviceName}, but characteristic UUID not found.`);
        return;
      }
      const nextHwModel = inferHwModel(result.deviceName);
      const nextFwVersion = inferFwVersion(result.deviceName, fwVersion);
      setDeviceId(result.deviceId);
      setHwModel(nextHwModel);
      setFwVersion(nextFwVersion);
      setVerifiedDeviceName(result.deviceName);
      const verifiedTarget: SavedProvisionTarget = {
        deviceId: result.deviceId,
        deviceName: result.deviceName,
        cabinetId: cabinetId.trim(),
        tenantId: tenantId.trim(),
        hwModel: nextHwModel,
        fwVersion: nextFwVersion,
        localBaseUrl: normalizeLocalBaseUrl(localBaseUrl) || provisionedDeviceUrl.replace(/\/+$/, ""),
        updatedAtIso: new Date().toISOString()
      };
      await recordProvisionedTarget(verifiedTarget);
      setFieldErrors((prev) => ({
        ...prev,
        deviceId: undefined,
        serviceUuid: undefined,
        characteristicUuid: undefined
      }));
      setStep("done");
      setNote(`Verified: ${result.deviceName} matches service + characteristic.`);
      showActionAlert(
        "Verify Success",
        `Device ID locked: ${result.deviceId}\nHW: ${nextHwModel}\nFW: ${nextFwVersion}\nSaved to MFGR green list.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "BLE verification failed";
      setStep("failed");
      setNote(message);
      showActionAlert("Verify Failed", message);
    } finally {
      client.destroy();
      setVerifying(false);
      setActiveBleAction("");
    }
  };

  const runBleProvision = async (): Promise<void> => {
    setProvisionOk(false);
    const errors = validateProvisionInputs();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setStep("failed");
      setNote("Please correct highlighted fields before provisioning.");
      showActionAlert("Validation Error", "Please correct highlighted fields before provisioning.");
      return;
    }

    setActiveBleAction("provision");
    setStep("running");
    setNote("Preparing BLE provisioning session...");
    const client = new BleProvisionClient();
    try {
      const timeoutMs = Math.max(3, Number.parseInt(scanTimeoutSec || "12", 10) || 12) * 1000;
      const result = await client.provision({
        payload,
        targetDeviceId: targetDeviceId.trim() || undefined,
        targetNamePrefix: targetNamePrefix.trim() || undefined,
        serviceUuid,
        characteristicUuid,
        scanTimeoutMs: timeoutMs,
        onProgress: (_phase, message) => setNote(message)
      });
      setStep("done");
      setProvisionOk(true);
      setLocalFlowUnlocked(true);
      setHideProvisionForms(true);
      setNote(`Provision successful: ${result.deviceName} (${result.deviceId}), payload bytes=${result.bytesWritten}`);
      const savedTarget: SavedProvisionTarget = {
        deviceId: result.deviceId,
        deviceName: result.deviceName,
        cabinetId: cabinetId.trim(),
        tenantId: tenantId.trim(),
        hwModel: hwModel.trim() || inferHwModel(result.deviceName),
        fwVersion: fwVersion.trim() || inferFwVersion(result.deviceName, "1.0.0"),
        localBaseUrl: normalizeLocalBaseUrl(localBaseUrl) || provisionedDeviceUrl.replace(/\/+$/, ""),
        updatedAtIso: new Date().toISOString()
      };
      await recordProvisionedTarget(savedTarget);
      showActionAlert("Provision Success", `Provisioning completed for ${result.deviceId}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "BLE provisioning failed";
      setStep("failed");
      setProvisionOk(false);
      setNote(message);
      showActionAlert("Provision Failed", message);
    } finally {
      client.destroy();
      setActiveBleAction("");
    }
  };

  const openProvisionedLink = (): void => {
    const url = normalizeLocalBaseUrl(localBaseUrl) || provisionedDeviceUrl.replace(/\/+$/, "");
    if (!url) {
      setStep("failed");
      setNote("Device URL is required.");
      showActionAlert("Open Failed", "Device URL is required.");
      return;
    }
    setLocalPageUrl(url);
    setLocalPageVisible(true);
  };

  const renderOptionRow = (
    title: string,
    selected: string,
    onPick: (value: string) => void,
    options: OptionItem[]
  ): React.JSX.Element => (
    <View style={styles.optionWrap}>
      <Text style={styles.optionLabel}>{title}</Text>
      <View style={styles.optionRow}>
        {options.map((option) => (
          <Pressable
            key={`${title}-${option.value}`}
            style={({ pressed }) => [
              styles.optionChip,
              selected === option.value && styles.optionChipActive,
              pressed && styles.buttonPressed
            ]}
            onPress={() => onPick(option.value)}
          >
            <Text style={[styles.optionChipText, selected === option.value && styles.optionChipTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const drawerTotal = asPositiveInt(layoutDrawerCount, 24);
  const drawerOpenCount = drawerOpenFlags.filter((flag) => flag).length;
  const drawerFlags = Array.from({ length: drawerTotal }, (_, idx) => drawerOpenFlags[idx] ?? false);
  const fallbackTarget: SavedProvisionTarget | null =
    (deviceId.trim() || targetDeviceId.trim())
      ? {
          deviceId: deviceId.trim() || targetDeviceId.trim(),
          deviceName: verifiedDeviceName || targetNamePrefix.trim() || "Current Target",
          cabinetId: cabinetId.trim(),
          tenantId: tenantId.trim(),
          hwModel: hwModel.trim(),
          fwVersion: fwVersion.trim(),
          localBaseUrl: normalizeLocalBaseUrl(localBaseUrl) || provisionedDeviceUrl.replace(/\/+$/, ""),
          updatedAtIso: new Date().toISOString()
        }
      : null;
  const targetsToRender = provisionedTargets.length > 0 ? provisionedTargets : fallbackTarget ? [fallbackTarget] : [];

  return (
    <>
      <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.section}>
        <Text style={styles.title}>BLE Provisioning (Live Integration)</Text>
        <Text style={styles.meta}>API: {session.baseUrl}</Text>
        <Text style={styles.meta}>Status: {step.toUpperCase()}</Text>
        <Text style={[styles.note, step === "failed" ? styles.noteError : step === "done" ? styles.noteOk : undefined]}>{note}</Text>
        {busy || localBusy ? (
          <View style={styles.progressBanner}>
            <ActivityIndicator color="#ffffff" size="small" />
            <Text style={styles.progressText}>{busy ? note : localBusyAction || "Processing..."}</Text>
          </View>
        ) : null}
        {provisionOk ? (
          <Pressable style={({ pressed }) => [styles.successLinkBox, pressed && styles.buttonPressed]} onPress={() => void openProvisionedLink()}>
            <Text style={styles.successLinkTitle}>Provisioning confirmed</Text>
            <Text style={styles.successLinkText}>{provisionedDeviceUrl}</Text>
            <Text style={styles.successLinkHint}>Tap to open on this mobile</Text>
          </Pressable>
        ) : null}
        <Text style={styles.tip}>Note: BLE native module requires custom dev client / built APK (not Expo Go).</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MFGR Post-BLE Flow</Text>
        <LabeledInput
          label="Device URL (for local discovery)"
          value={localBaseUrl}
          onChangeText={setLocalBaseUrl}
          placeholder="http://smart-cabinet-c3.local or http://192.168.x.x"
        />
        {targetsToRender.length > 0 ? (
          <View style={styles.scanList}>
            {targetsToRender.map((target) => (
              <Pressable
                key={`saved-${target.deviceId}`}
                style={({ pressed }) => [
                  styles.savedTargetCard,
                  target.deviceId === deviceId.trim() && styles.savedTargetCardActive,
                  pressed && styles.buttonPressed
                ]}
                onPress={() => applySavedTarget(target)}
              >
                <Text style={styles.savedTargetTitle}>{target.deviceId}</Text>
                <Text style={styles.scanMeta}>
                  {target.cabinetId} | {target.hwModel} | FW {target.fwVersion}
                </Text>
                <Text style={styles.scanMeta}>Source: {target.source || "local"}{target.healthStatus ? ` | ${target.healthStatus}` : ""}</Text>
                <Text style={styles.scanMeta}>{target.updatedAtIso}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.meta}>No provisioned target yet. Verify/select BLE target and it will appear here.</Text>
        )}
        <Pressable
          style={buttonStyle(styles.secondaryActionButton, localBusy || busy)}
          disabled={localBusy || busy}
          onPress={() => void discoverProvisionedTargets()}
        >
          {actionButtonContent(
            (localBusy && localBusyAction === "Discovering provisioned devices") || activeBleAction === "discover_targets",
            "Find Provisioned Devices (Touch Here)"
          )}
        </Pressable>
        {!!localFlash ? <Text style={styles.noteOk}>{localFlash}</Text> : null}
        {!!localError ? <Text style={styles.noteError}>{localError}</Text> : null}
      </View>

      {hideProvisionForms ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BLE Provisioning Wrap-up</Text>
          <Text style={styles.meta}>Target: {targetDeviceId || deviceId || "-"}</Text>
          <Text style={styles.meta}>Device ID (locked): {deviceId || "-"}</Text>
          <Text style={styles.meta}>Cabinet: {cabinetId || "-"}</Text>
          <Text style={styles.meta}>Tenant: {tenantId || "-"}</Text>
          <Text style={styles.meta}>HW/FW: {hwModel || "-"} / {fwVersion || "-"}</Text>
          <Pressable style={buttonStyle(styles.editButton, busy)} disabled={busy} onPress={() => setHideProvisionForms(false)}>
            {actionButtonContent(false, "Show Provision Forms")}
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BLE Target</Text>
            <LabeledInput
              label="Target Device ID (optional)"
              value={targetDeviceId}
              onChangeText={(value) => {
                setTargetDeviceId(value);
                setFieldErrors((prev) => ({ ...prev, deviceId: undefined }));
              }}
              placeholder="AA:BB:CC:11:22:33"
            />
            <LabeledInput
              label="Target Name Prefix (optional)"
              value={targetNamePrefix}
              onChangeText={setTargetNamePrefix}
              placeholder="smart-cabinet"
            />
            <LabeledInput
              label="Service UUID"
              value={serviceUuid}
              onChangeText={(value) => {
                setServiceUuid(value);
                setFieldErrors((prev) => ({ ...prev, serviceUuid: undefined }));
              }}
              placeholder="0000ff00-..."
              hasError={!!fieldErrors.serviceUuid}
              helperText={fieldErrors.serviceUuid}
            />
            <LabeledInput
              label="Characteristic UUID"
              value={characteristicUuid}
              onChangeText={(value) => {
                setCharacteristicUuid(value);
                setFieldErrors((prev) => ({ ...prev, characteristicUuid: undefined }));
              }}
              placeholder="0000ff01-..."
              hasError={!!fieldErrors.characteristicUuid}
              helperText={fieldErrors.characteristicUuid}
            />
            <LabeledInput
              label="Scan Timeout (sec)"
              value={scanTimeoutSec}
              onChangeText={(value) => {
                setScanTimeoutSec(value);
                setFieldErrors((prev) => ({ ...prev, scanTimeoutSec: undefined }));
              }}
              placeholder="12"
              hasError={!!fieldErrors.scanTimeoutSec}
              helperText={fieldErrors.scanTimeoutSec}
            />
            <Pressable disabled={busy} style={buttonStyle(styles.scanButton, busy)} onPress={runBleScan}>
              {actionButtonContent(scanning || activeBleAction === "scan", "Scan Nearby BLE Devices")}
            </Pressable>
            <Pressable disabled={busy} style={buttonStyle(styles.verifyButton, busy)} onPress={verifySelectedDevice}>
              {actionButtonContent(verifying || activeBleAction === "verify", "Verify Selected Device")}
            </Pressable>
            {scanResults.length > 0 ? (
              <View style={styles.scanList}>
                {scanResults.map((item) => (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [styles.scanRow, targetDeviceId.trim() === item.id && styles.scanRowActive, pressed && styles.buttonPressed]}
                    onPress={() => selectScannedDevice(item)}
                  >
                    <Text style={styles.scanTitle}>{item.name}</Text>
                    <Text style={styles.scanMeta}>{item.id}</Text>
                    <Text style={styles.scanMeta}>RSSI: {item.rssi ?? "-"}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Device Register Payload</Text>
            <LabeledInput
              label="Device ID (Locked From Verify)"
              value={deviceId}
              onChangeText={setDeviceId}
              placeholder="c3-ac276e5e9ac4"
              editable={!verifiedDeviceName && !localFlowUnlocked}
              hasError={!!fieldErrors.deviceId}
              helperText={fieldErrors.deviceId || (verifiedDeviceName ? `Verified target: ${verifiedDeviceName}` : "")}
            />
            <LabeledInput
              label="Cabinet ID"
              value={cabinetId}
              onChangeText={(value) => {
                setCabinetId(value);
                setFieldErrors((prev) => ({ ...prev, cabinetId: undefined }));
              }}
              placeholder="cab-1001"
              hasError={!!fieldErrors.cabinetId}
              helperText={fieldErrors.cabinetId}
            />
            <LabeledInput
              label="Tenant ID"
              value={tenantId}
              onChangeText={(value) => {
                setTenantId(value);
                setFieldErrors((prev) => ({ ...prev, tenantId: undefined }));
              }}
              placeholder="tenant-001"
              hasError={!!fieldErrors.tenantId}
              helperText={fieldErrors.tenantId}
            />
            <LabeledInput
              label="HW Model (Locked From Verify)"
              value={hwModel}
              onChangeText={setHwModel}
              placeholder="esp32-c3"
              editable={!verifiedDeviceName && !localFlowUnlocked}
            />
            <LabeledInput
              label="FW Version (Locked From Verify)"
              value={fwVersion}
              onChangeText={setFwVersion}
              placeholder="1.0.0"
              editable={!verifiedDeviceName && !localFlowUnlocked}
            />
            <LabeledInput label="Provision Key (optional)" value={provisionKey} onChangeText={setProvisionKey} placeholder="server provision key" />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>WiFi Bootstrap</Text>
            <LabeledInput label="SSID" value={wifiSsid} onChangeText={setWifiSsid} placeholder="Factory-WiFi" />
            <LabeledInput label="Password" value={wifiPassword} onChangeText={setWifiPassword} secureTextEntry placeholder="WiFi password" />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Generated JSON Payload</Text>
            <View style={styles.payloadBox}>
              <Text selectable style={styles.payloadText}>
                {JSON.stringify(payload, null, 2)}
              </Text>
            </View>
            <Pressable disabled={busy} style={buttonStyle(styles.primaryButton, busy)} onPress={runBleProvision}>
              {actionButtonContent(running || activeBleAction === "provision", "Run BLE Provision")}
            </Pressable>
          </View>
        </>
      )}

      {localReady ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Device Health</Text>
            <LabeledInput
              label="Device URL"
              value={localBaseUrl}
              onChangeText={setLocalBaseUrl}
              placeholder="http://smart-cabinet-c3.local"
            />
            <View style={styles.rowActions}>
              <Pressable
                style={buttonStyle(styles.secondaryActionButton, localBusy)}
                disabled={localBusy}
                onPress={() => void refreshLocalDashboard()}
              >
                {actionButtonContent(localBusy && localBusyAction === "Refreshing local dashboard", "Refresh Device Health")}
              </Pressable>
              <Pressable style={buttonStyle(styles.editButton, false)} onPress={() => void openProvisionedLink()}>
                {actionButtonContent(false, "Open Local Page")}
              </Pressable>
            </View>
            {!!localFlash ? <Text style={styles.noteOk}>{localFlash}</Text> : null}
            {!!localError ? <Text style={styles.noteError}>{localError}</Text> : null}
            <View style={styles.healthGrid}>
              <Text style={styles.meta}>IP: {localHealth?.ip || "-"}</Text>
              <Text style={styles.meta}>Host: {localHealth?.hostname || "-"}</Text>
              <Text style={styles.meta}>Cabinet: {localHealth?.cabinet_id_2d || "-"}</Text>
              <Text style={styles.meta}>Name: {localHealth?.cabinet_name || "-"}</Text>
              <Text style={styles.meta}>Drawers: {localHealth?.drawer_count ?? "-"}</Text>
              <Text style={styles.meta}>Board: {localHealth?.board ?? "-"}</Text>
              <Text style={styles.meta}>Cards: {localHealth?.control_cards ?? "-"}</Text>
              <Text style={styles.meta}>Locks/Card: {localHealth?.locks_per_card ?? "-"}</Text>
              <Text style={styles.meta}>Max Lockers: {localHealth?.max_supported_lockers ?? "-"}</Text>
              <Text style={styles.meta}>WG Events: {localHealth?.wg_events ?? 0}</Text>
              <Text style={styles.meta}>TX Count: {localHealth?.tx_count ?? 0}</Text>
              <Text style={styles.meta}>Intent: {localHealth?.ops_locker_intent || "-"}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cabinet Layout + Live Animation</Text>
            <LabeledInput label="Cabinet ID (2D)" value={layoutCabinetId2d} onChangeText={setLayoutCabinetId2d} placeholder="01" />
            <LabeledInput label="Cabinet Name" value={layoutCabinetName} onChangeText={setLayoutCabinetName} placeholder="Smart Cabinet" />
            <LabeledInput
              label="Cabinet Location"
              value={layoutCabinetLocation}
              onChangeText={setLayoutCabinetLocation}
              placeholder="LAN"
            />
            <LabeledInput label="Drawer Count" value={layoutDrawerCount} onChangeText={setLayoutDrawerCount} placeholder="24" />
            <LabeledInput label="Board Base" value={layoutBoard} onChangeText={setLayoutBoard} placeholder="0" />
            <LabeledInput label="Control Cards" value={layoutControlCards} onChangeText={setLayoutControlCards} placeholder="1" />
            <LabeledInput label="Locks Per Card" value={layoutLocksPerCard} onChangeText={setLayoutLocksPerCard} placeholder="24" />

            <View style={styles.rowActions}>
              <Pressable
                style={buttonStyle(styles.secondaryActionButton, localBusy)}
                disabled={localBusy}
                onPress={() => void saveCabinetLayout()}
              >
                {actionButtonContent(localBusy && localBusyAction === "Saving cabinet layout", "Save Layout")}
              </Pressable>
              <Pressable
                style={buttonStyle(styles.editButton, localBusy)}
                disabled={localBusy}
                onPress={() =>
                  void runLocalAction("Loading cabinet meta", async () => {
                    await refreshCabinetMeta();
                    await refreshStatusForLayout(true);
                    setLocalFlash("Cabinet metadata loaded.");
                  })
                }
              >
                {actionButtonContent(localBusy && localBusyAction === "Loading cabinet meta", "Load Layout")}
              </Pressable>
            </View>
            <View style={styles.rowActions}>
              <Pressable
                style={buttonStyle(styles.secondaryActionButton, localBusy)}
                disabled={localBusy}
                onPress={() => void autoDetectLayout()}
              >
                {actionButtonContent(localBusy && localBusyAction === "Auto detecting RS485 layout", "Auto Detect + Apply")}
              </Pressable>
              <Pressable
                style={buttonStyle(styles.editButton, localBusy)}
                disabled={localBusy}
                onPress={() => void queryLockStatus()}
              >
                {actionButtonContent(localBusy && localBusyAction === "Querying RS485 lock status", "Refresh Lock Status")}
              </Pressable>
            </View>
            <Text style={styles.wrapMeta}>{scanBoardInfo}</Text>
            <Text style={styles.meta}>
              Live status: open {drawerOpenCount} / closed {Math.max(0, drawerTotal - drawerOpenCount)}
            </Text>
            <View style={styles.drawerGrid}>
              {drawerFlags.map((isOpen, idx) => (
                <View
                  key={`drawer-${idx + 1}`}
                  style={[
                    styles.drawerCell,
                    isOpen && styles.drawerCellOpen,
                    isOpen && livePulse && styles.drawerCellPulse
                  ]}
                >
                  <Text style={styles.drawerIndex}>L{idx + 1}</Text>
                  <Text style={styles.drawerState}>{isOpen ? "OPEN" : "CLOSED"}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Operation Mode Settings</Text>
            {renderOptionRow("Method", opsMethod, setOpsMethod, OPS_METHOD_OPTIONS)}
            {renderOptionRow("Drawer Strategy", opsDrawerStrategy, setOpsDrawerStrategy, DRAWER_STRATEGY_OPTIONS)}
            <LabeledInput label="Fixed Drawer ID" value={opsFixedDrawerId} onChangeText={setOpsFixedDrawerId} placeholder="1" />
            {renderOptionRow("WG Access", opsWgAccessMode, setOpsWgAccessMode, WG_ACCESS_OPTIONS)}
            {renderOptionRow("Action", opsLockerIntent, setOpsLockerIntent, LOCKER_INTENT_OPTIONS)}
            <LabeledInput label="Allow Uses Type" value={opsAllowUsesType} onChangeText={setOpsAllowUsesType} placeholder="1" />
            {renderOptionRow("Identity", opsIdentityMode, setOpsIdentityMode, IDENTITY_MODE_OPTIONS)}
            <View style={styles.rowActions}>
              <Pressable
                style={buttonStyle(styles.secondaryActionButton, localBusy)}
                disabled={localBusy}
                onPress={() => void saveOpsMode()}
              >
                {actionButtonContent(localBusy && localBusyAction === "Saving operation mode", "Save Mode")}
              </Pressable>
              <Pressable
                style={buttonStyle(styles.editButton, localBusy)}
                disabled={localBusy}
                onPress={() =>
                  void runLocalAction("Loading operation mode", async () => {
                    await refreshOpsMode();
                    setLocalFlash("Operation mode loaded.");
                  })
                }
              >
                {actionButtonContent(localBusy && localBusyAction === "Loading operation mode", "Reload Mode")}
              </Pressable>
            </View>
            <Text style={styles.meta}>
              Current: method={localOpsMode?.method || "-"} | strategy={localOpsMode?.drawer_strategy || "-"} | intent=
              {localOpsMode?.locker_intent || "-"}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Wiegand Live</Text>
            <View style={styles.payloadBox}>
              <Text style={styles.payloadText}>
                {localWgLatest?.has_event && localWgLatest.event
                  ? `seq=${localWgLatest.event.sequence ?? "-"} bits=${localWgLatest.event.bits ?? "-"} source=${
                      localWgLatest.event.source ?? "-"
                    }\nuser=${localWgLatest.event.card_id ?? "-"} raw=${localWgLatest.event.raw_hex ?? "-"}`
                  : "No card event yet."}
              </Text>
            </View>
            <Pressable
              style={buttonStyle(styles.secondaryActionButton, localBusy)}
              disabled={localBusy}
              onPress={() =>
                void runLocalAction("Refreshing wiegand live", async () => {
                  await refreshWiegand();
                  setLocalFlash("Wiegand live refreshed.");
                })
              }
            >
              {actionButtonContent(localBusy && localBusyAction === "Refreshing wiegand live", "Refresh Wiegand")}
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>RS485 Single Lock Open (0x50)</Text>
            <LabeledInput label="Board" value={openBoard} onChangeText={setOpenBoard} placeholder="0" />
            <LabeledInput label="Lock Addr (0-based)" value={openLockAddr} onChangeText={setOpenLockAddr} placeholder="0" />
            {renderOptionRow("Action", openIntent, setOpenIntent, LOCKER_INTENT_OPTIONS)}
            <LabeledInput label="User ID (optional)" value={openUserRef} onChangeText={setOpenUserRef} placeholder="member-001" />
            <View style={styles.rowActions}>
              <Pressable
                style={buttonStyle(styles.secondaryActionButton, localBusy)}
                disabled={localBusy}
                onPress={() => void openSingleLock()}
              >
                {actionButtonContent(localBusy && localBusyAction === "Opening single lock", "Open Lock")}
              </Pressable>
              <Pressable
                style={buttonStyle(styles.editButton, localBusy)}
                disabled={localBusy}
                onPress={() => void scanBoards()}
              >
                {actionButtonContent(localBusy && localBusyAction === "Scanning RS485 boards", "Scan 0-15")}
              </Pressable>
            </View>
            <Text style={styles.wrapMeta}>{scanBoardInfo}</Text>
            <View style={styles.payloadBox}>
              <Text selectable style={styles.payloadText}>
                {openResult}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>RS485 Queries</Text>
            <LabeledInput label="Board" value={queryBoard} onChangeText={setQueryBoard} placeholder="0" />
            <View style={styles.rowActions}>
              <Pressable
                style={buttonStyle(styles.secondaryActionButton, localBusy)}
                disabled={localBusy}
                onPress={() => void queryLockStatus()}
              >
                {actionButtonContent(localBusy && localBusyAction === "Querying RS485 lock status", "Lock Status (0x51)")}
              </Pressable>
              <Pressable
                style={buttonStyle(styles.editButton, localBusy)}
                disabled={localBusy}
                onPress={() => void queryInfrared()}
              >
                {actionButtonContent(localBusy && localBusyAction === "Querying RS485 infrared", "IR Status (0x40)")}
              </Pressable>
              <Pressable
                style={buttonStyle(styles.editButton, localBusy)}
                disabled={localBusy}
                onPress={() => void queryVersion()}
              >
                {actionButtonContent(localBusy && localBusyAction === "Querying RS485 version", "Version (0x7B)")}
              </Pressable>
            </View>
            <View style={styles.payloadBox}>
              <Text selectable style={styles.payloadText}>
                {queryResult}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Wiegand Live (Recent Feed)</Text>
            <View style={styles.eventsList}>
              {(localWgRecent?.events ?? []).slice(0, 12).map((evt) => (
                <View key={`wg-${evt.sequence ?? 0}-${evt.captured_ms ?? 0}`} style={styles.eventRow}>
                  <Text style={styles.scanTitle}>#{evt.sequence ?? "-"}</Text>
                  <Text style={styles.scanMeta}>
                    bits={evt.bits ?? "-"} source={evt.source ?? "-"} user={evt.card_id ?? "-"}
                  </Text>
                  <Text style={styles.scanMeta}>raw={evt.raw_hex ?? "-"} ms={evt.captured_ms ?? "-"}</Text>
                </View>
              ))}
              {(localWgRecent?.events?.length ?? 0) === 0 ? <Text style={styles.meta}>No Wiegand events captured yet.</Text> : null}
            </View>
            <Text style={styles.sectionTitle}>Transactions (Last 100)</Text>
            <View style={styles.eventsList}>
              {(localTxRecent?.events ?? []).slice(0, 16).map((evt) => (
                <View key={`tx-${evt.sequence ?? 0}-${evt.protocol_code ?? "x"}`} style={styles.eventRow}>
                  <Text style={styles.scanTitle}>#{evt.sequence ?? "-"}</Text>
                  <Text style={styles.scanMeta}>
                    {evt.action ?? "-"} | {evt.time_hms ?? "-"} | {evt.user_ref ?? "-"}
                  </Text>
                  <Text style={styles.scanMeta}>
                    B{evt.board ?? "-"} L{evt.lock !== undefined ? evt.lock + 1 : "-"} | {evt.protocol_code ?? "-"} | {evt.source ?? "-"}
                  </Text>
                </View>
              ))}
              {(localTxRecent?.events?.length ?? 0) === 0 ? <Text style={styles.meta}>No transaction events yet.</Text> : null}
            </View>
            <Pressable
              style={buttonStyle(styles.secondaryActionButton, localBusy)}
              disabled={localBusy}
              onPress={() =>
                void runLocalAction("Refreshing recent feeds", async () => {
                  await Promise.all([refreshWiegand(), refreshTransactions()]);
                  setLocalFlash("Recent feeds refreshed.");
                })
              }
            >
              {actionButtonContent(localBusy && localBusyAction === "Refreshing recent feeds", "Refresh Recent Feed")}
            </Pressable>
          </View>
        </>
      ) : null}
      </ScrollView>
      <Modal
        visible={localPageVisible}
        animationType="slide"
        onRequestClose={() => setLocalPageVisible(false)}
      >
        <View style={styles.localPageRoot}>
          <View style={styles.localPageHeader}>
            <Text style={styles.localPageTitle}>Local Device Page</Text>
            <Pressable
              style={({ pressed }) => [styles.localPageCloseButton, pressed && styles.buttonPressed]}
              onPress={() => setLocalPageVisible(false)}
            >
              <Text style={styles.localPageCloseText}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.localPageUrl}>{localPageUrl}</Text>
          <WebView
            source={{ uri: localPageUrl }}
            style={styles.localPageWebView}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.localPageLoading}>
                <ActivityIndicator color="#2b8d5f" />
                <Text style={styles.meta}>Loading local page...</Text>
              </View>
            )}
            onError={() => {
              setLocalError(`Failed to load ${localPageUrl}. Check same network or URL.`);
            }}
          />
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    backgroundColor: "#0a101a"
  },
  section: {
    borderWidth: 1,
    borderColor: "#1e2b3c",
    borderRadius: 14,
    backgroundColor: "#0f1826",
    padding: 14,
    marginBottom: 12
  },
  title: {
    color: "#f5f8ff",
    fontWeight: "700",
    fontSize: 20,
    marginBottom: 8
  },
  sectionTitle: {
    color: "#f2f7ff",
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 10
  },
  meta: {
    color: "#9fb0cb",
    fontSize: 12,
    marginBottom: 4
  },
  note: {
    color: "#c7d8ef",
    marginTop: 4,
    fontSize: 12
  },
  noteOk: {
    color: "#8de7b6"
  },
  noteError: {
    color: "#ff9e9e"
  },
  successLinkBox: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#37b16f",
    backgroundColor: "#113522",
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  successLinkTitle: {
    color: "#b8ffd8",
    fontSize: 13,
    fontWeight: "700"
  },
  successLinkText: {
    color: "#e3fff0",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2
  },
  successLinkHint: {
    color: "#a9f3cc",
    fontSize: 11,
    marginTop: 4
  },
  tip: {
    color: "#90a4c6",
    fontSize: 11,
    marginTop: 8
  },
  progressBanner: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#355986",
    backgroundColor: "#132338",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  progressText: {
    color: "#d5e6ff",
    fontSize: 12,
    flexShrink: 1
  },
  payloadBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334459",
    backgroundColor: "#0a111b",
    padding: 10,
    maxHeight: 240
  },
  wrapCard: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#315079",
    borderRadius: 12,
    backgroundColor: "#101b2d",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  wrapLabel: {
    color: "#9ec5ff",
    fontSize: 11,
    marginBottom: 4
  },
  wrapId: {
    color: "#f3f8ff",
    fontSize: 15,
    fontWeight: "700"
  },
  wrapMeta: {
    color: "#aec2df",
    fontSize: 12,
    marginTop: 3
  },
  payloadText: {
    color: "#d7e3f8",
    fontFamily: "monospace",
    fontSize: 11
  },
  primaryButton: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: "#2b8d5f",
    alignItems: "center",
    paddingVertical: 11
  },
  scanButton: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: "#246efc",
    alignItems: "center",
    paddingVertical: 11
  },
  verifyButton: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: "#7c4dff",
    alignItems: "center",
    paddingVertical: 11
  },
  scanList: {
    marginTop: 10,
    gap: 8
  },
  scanRow: {
    borderWidth: 1,
    borderColor: "#334459",
    borderRadius: 10,
    backgroundColor: "#0a111b",
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  scanRowActive: {
    borderColor: "#2b8d5f",
    backgroundColor: "#102319"
  },
  scanTitle: {
    color: "#e8f2ff",
    fontWeight: "700",
    fontSize: 13
  },
  scanMeta: {
    color: "#9fb0cb",
    fontSize: 11,
    marginTop: 2
  },
  buttonDisabled: {
    opacity: 0.7
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }]
  },
  rowActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8
  },
  editButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3c6bb8",
    backgroundColor: "#1b315a",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  deleteButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#923a3a",
    backgroundColor: "#4f1f1f",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  rowActionText: {
    color: "#f0f5ff",
    fontWeight: "700",
    fontSize: 12
  },
  secondaryActionButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2c8a62",
    backgroundColor: "#14553a",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  healthGrid: {
    marginTop: 8,
    gap: 3
  },
  optionWrap: {
    marginBottom: 8
  },
  optionLabel: {
    color: "#c9ddff",
    fontSize: 12,
    marginBottom: 5
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  optionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#33537d",
    backgroundColor: "#0f1e32",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  optionChipActive: {
    borderColor: "#2b8d5f",
    backgroundColor: "#17462f"
  },
  optionChipText: {
    color: "#b9cce8",
    fontSize: 11,
    fontWeight: "700"
  },
  optionChipTextActive: {
    color: "#dcffe7"
  },
  drawerGrid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  drawerCell: {
    width: "23%",
    minWidth: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#324359",
    backgroundColor: "#101a28",
    paddingVertical: 8,
    paddingHorizontal: 6
  },
  drawerCellOpen: {
    borderColor: "#d58c2c",
    backgroundColor: "#553412"
  },
  drawerCellPulse: {
    transform: [{ scale: 1.03 }]
  },
  drawerIndex: {
    color: "#eff6ff",
    fontWeight: "700",
    fontSize: 12
  },
  drawerState: {
    color: "#c5d5eb",
    fontSize: 10,
    marginTop: 3
  },
  eventsList: {
    marginTop: 8,
    gap: 7
  },
  eventRow: {
    borderWidth: 1,
    borderColor: "#2b3e56",
    borderRadius: 8,
    backgroundColor: "#0b1420",
    paddingHorizontal: 9,
    paddingVertical: 8
  },
  savedTargetCard: {
    borderWidth: 2,
    borderColor: "#2f9b65",
    borderRadius: 11,
    backgroundColor: "#102a1f",
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  savedTargetCardActive: {
    borderColor: "#71e6a9",
    backgroundColor: "#173727"
  },
  savedTargetTitle: {
    color: "#d2ffe8",
    fontSize: 13,
    fontWeight: "700"
  },
  localPageRoot: {
    flex: 1,
    backgroundColor: "#08111b",
    paddingTop: 24
  },
  localPageHeader: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#223247"
  },
  localPageTitle: {
    color: "#f2f7ff",
    fontSize: 15,
    fontWeight: "700"
  },
  localPageCloseButton: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#3c6bb8",
    backgroundColor: "#1b315a",
    paddingHorizontal: 13,
    paddingVertical: 7
  },
  localPageCloseText: {
    color: "#f2f7ff",
    fontWeight: "700",
    fontSize: 12
  },
  localPageUrl: {
    color: "#94accf",
    fontSize: 11,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8
  },
  localPageWebView: {
    flex: 1
  },
  localPageLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  primaryText: {
    color: "#ffffff",
    fontWeight: "700"
  }
});
