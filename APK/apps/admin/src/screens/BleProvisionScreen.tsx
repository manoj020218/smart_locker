import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BleProvisionClient } from "../ble/provision";
import { LabeledInput } from "../components/LabeledInput";
import type { AppSession } from "../types/api";

type Props = {
  session: AppSession;
};

type ProvisionStep = "idle" | "running" | "done" | "failed";

export const BleProvisionScreen = ({ session }: Props): React.JSX.Element => {
  const [deviceId, setDeviceId] = useState("");
  const [cabinetId, setCabinetId] = useState("");
  const [tenantId, setTenantId] = useState(session.tenantId || "");
  const [hwModel, setHwModel] = useState("esp32-c3");
  const [fwVersion, setFwVersion] = useState("1.0.0");
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [provisionKey, setProvisionKey] = useState("");

  const [targetDeviceId, setTargetDeviceId] = useState("");
  const [targetNamePrefix, setTargetNamePrefix] = useState("smart-cabinet");
  const [serviceUuid, setServiceUuid] = useState("0000ff00-0000-1000-8000-00805f9b34fb");
  const [characteristicUuid, setCharacteristicUuid] = useState("0000ff01-0000-1000-8000-00805f9b34fb");
  const [scanTimeoutSec, setScanTimeoutSec] = useState("12");

  const [step, setStep] = useState<ProvisionStep>("idle");
  const [note, setNote] = useState("Configure payload and run BLE provisioning.");

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

  const runBleProvision = async (): Promise<void> => {
    if (!payload.device_register.device_id || !payload.device_register.cabinet_id || !payload.device_register.tenant_id) {
      setStep("failed");
      setNote("Required fields missing: device_id, cabinet_id, tenant_id.");
      return;
    }
    if (!serviceUuid.trim() || !characteristicUuid.trim()) {
      setStep("failed");
      setNote("BLE service UUID and characteristic UUID are required.");
      return;
    }

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
      setNote(`Provision successful: ${result.deviceName} (${result.deviceId}), payload bytes=${result.bytesWritten}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "BLE provisioning failed";
      setStep("failed");
      setNote(message);
    } finally {
      client.destroy();
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.section}>
        <Text style={styles.title}>BLE Provisioning (Live Integration)</Text>
        <Text style={styles.meta}>API: {session.baseUrl}</Text>
        <Text style={styles.meta}>Status: {step.toUpperCase()}</Text>
        <Text style={[styles.note, step === "failed" ? styles.noteError : step === "done" ? styles.noteOk : undefined]}>{note}</Text>
        <Text style={styles.tip}>Note: BLE native module requires custom dev client / built APK (not Expo Go).</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>BLE Target</Text>
        <LabeledInput
          label="Target Device ID (optional)"
          value={targetDeviceId}
          onChangeText={setTargetDeviceId}
          placeholder="AA:BB:CC:11:22:33"
        />
        <LabeledInput
          label="Target Name Prefix (optional)"
          value={targetNamePrefix}
          onChangeText={setTargetNamePrefix}
          placeholder="smart-cabinet"
        />
        <LabeledInput label="Service UUID" value={serviceUuid} onChangeText={setServiceUuid} placeholder="0000ff00-..." />
        <LabeledInput
          label="Characteristic UUID"
          value={characteristicUuid}
          onChangeText={setCharacteristicUuid}
          placeholder="0000ff01-..."
        />
        <LabeledInput label="Scan Timeout (sec)" value={scanTimeoutSec} onChangeText={setScanTimeoutSec} placeholder="12" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device Register Payload</Text>
        <LabeledInput label="Device ID" value={deviceId} onChangeText={setDeviceId} placeholder="c3-ac276e5e9ac4" />
        <LabeledInput label="Cabinet ID" value={cabinetId} onChangeText={setCabinetId} placeholder="cab-1001" />
        <LabeledInput label="Tenant ID" value={tenantId} onChangeText={setTenantId} placeholder="tenant-001" />
        <LabeledInput label="HW Model" value={hwModel} onChangeText={setHwModel} placeholder="esp32-c3" />
        <LabeledInput label="FW Version" value={fwVersion} onChangeText={setFwVersion} placeholder="1.0.0" />
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
        <Pressable disabled={running} style={[styles.primaryButton, running && styles.buttonDisabled]} onPress={runBleProvision}>
          {running ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Run BLE Provision</Text>}
        </Pressable>
      </View>
    </ScrollView>
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
  tip: {
    color: "#90a4c6",
    fontSize: 11,
    marginTop: 8
  },
  payloadBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334459",
    backgroundColor: "#0a111b",
    padding: 10,
    maxHeight: 240
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
  buttonDisabled: {
    opacity: 0.7
  },
  primaryText: {
    color: "#ffffff",
    fontWeight: "700"
  }
});

