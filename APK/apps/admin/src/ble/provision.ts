import { BleManager, type Device } from "react-native-ble-plx";
import { PermissionsAndroid, Platform } from "react-native";

const DEFAULT_SCAN_TIMEOUT_MS = 12000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 12000;
const DEFAULT_MTU = 185;

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export type BleProvisionInput = {
  payload: unknown;
  serviceUuid: string;
  characteristicUuid: string;
  targetDeviceId?: string;
  targetNamePrefix?: string;
  scanTimeoutMs?: number;
  connectTimeoutMs?: number;
  onProgress?: (phase: BleProvisionPhase, message: string) => void;
};

export type BleProvisionResult = {
  deviceId: string;
  deviceName: string;
  bytesWritten: number;
};

export type BleProvisionPhase = "permissions" | "waiting_bluetooth" | "scanning" | "connecting" | "discovering" | "writing";

const normalizeUuid = (value: string): string => value.trim().toLowerCase();

const toUtf8Bytes = (value: string): number[] => {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i += 1) {
    const char = encoded[i];
    if (char === "%") {
      const hex = encoded.slice(i + 1, i + 3);
      bytes.push(Number.parseInt(hex, 16));
      i += 2;
      continue;
    }
    bytes.push(char.charCodeAt(0));
  }
  return bytes;
};

const toBase64 = (value: string): string => {
  const bytes = toUtf8Bytes(value);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;

    out += BASE64_ALPHABET[(triple >> 18) & 63];
    out += BASE64_ALPHABET[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : "=";
  }
  return out;
};

const parseAndroidApi = (): number => {
  if (typeof Platform.Version === "number") return Platform.Version;
  const parsed = Number.parseInt(String(Platform.Version), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const requestBlePermissions = async (): Promise<void> => {
  if (Platform.OS !== "android") return;

  const apiLevel = parseAndroidApi();
  const permissions: string[] = [];

  if (apiLevel >= 31) {
    permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  }
  if (apiLevel >= 23) {
    permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }

  if (permissions.length === 0) return;

  for (const permission of permissions) {
    const status = await PermissionsAndroid.request(permission as never);
    if (status !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error(`Bluetooth permission denied: ${permission}`);
    }
  }
};

const waitForPoweredOn = async (manager: BleManager, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      subscription.remove();
      reject(new Error("Bluetooth is not powered on"));
    }, timeoutMs);

    const subscription = manager.onStateChange((state) => {
      if (settled) return;
      if (state === "PoweredOn") {
        settled = true;
        clearTimeout(timeout);
        subscription.remove();
        resolve();
      }
    }, true);
  });

const matchesTarget = (device: Device, targetDeviceId?: string, targetNamePrefix?: string): boolean => {
  if (targetDeviceId) {
    return device.id === targetDeviceId;
  }
  if (targetNamePrefix) {
    const needle = targetNamePrefix.toLowerCase();
    const name = (device.name ?? "").toLowerCase();
    const local = (device.localName ?? "").toLowerCase();
    return name.includes(needle) || local.includes(needle);
  }
  return true;
};

const scanForTargetDevice = async (
  manager: BleManager,
  targetDeviceId: string | undefined,
  targetNamePrefix: string | undefined,
  timeoutMs: number
): Promise<Device> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      manager.stopDeviceScan();
      reject(new Error("BLE scan timeout: target device not found"));
    }, timeoutMs);

    manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (settled) return;
      if (error) {
        settled = true;
        clearTimeout(timeout);
        manager.stopDeviceScan();
        reject(new Error(error.message || "BLE scanning failed"));
        return;
      }
      if (!device) return;
      if (!matchesTarget(device, targetDeviceId, targetNamePrefix)) return;

      settled = true;
      clearTimeout(timeout);
      manager.stopDeviceScan();
      resolve(device);
    });
  });

export class BleProvisionClient {
  private readonly manager: BleManager;

  constructor(manager?: BleManager) {
    this.manager = manager ?? new BleManager();
  }

  destroy(): void {
    this.manager.destroy();
  }

  async provision(input: BleProvisionInput): Promise<BleProvisionResult> {
    const serviceUuid = normalizeUuid(input.serviceUuid);
    const characteristicUuid = normalizeUuid(input.characteristicUuid);
    if (!serviceUuid || !characteristicUuid) {
      throw new Error("serviceUuid and characteristicUuid are required");
    }

    input.onProgress?.("permissions", "Requesting Bluetooth permissions...");
    await requestBlePermissions();
    input.onProgress?.("waiting_bluetooth", "Waiting for Bluetooth to turn on...");
    await waitForPoweredOn(this.manager, DEFAULT_CONNECTION_TIMEOUT_MS);

    input.onProgress?.("scanning", "Scanning nearby BLE devices...");
    const device = await scanForTargetDevice(
      this.manager,
      input.targetDeviceId?.trim() || undefined,
      input.targetNamePrefix?.trim() || undefined,
      Math.max(1000, input.scanTimeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS)
    );

    input.onProgress?.("connecting", `Connecting to ${device.localName ?? device.name ?? device.id}...`);
    const connected = await device.connect({ timeout: Math.max(1000, input.connectTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS) });
    try {
      input.onProgress?.("discovering", "Discovering services and characteristics...");
      let ready = await connected.discoverAllServicesAndCharacteristics();
      if (Platform.OS === "android") {
        try {
          ready = await ready.requestMTU(DEFAULT_MTU);
        } catch {
          // Optional MTU optimization; continue with default MTU if request fails.
        }
      }

      const payloadJson = JSON.stringify(input.payload);
      const encoded = toBase64(payloadJson);
      input.onProgress?.("writing", "Writing provisioning payload to characteristic...");
      await ready.writeCharacteristicWithResponseForService(serviceUuid, characteristicUuid, encoded);

      return {
        deviceId: ready.id,
        deviceName: ready.localName ?? ready.name ?? ready.id,
        bytesWritten: payloadJson.length
      };
    } finally {
      try {
        await connected.cancelConnection();
      } catch {
        // Best-effort disconnect.
      }
    }
  }
}
