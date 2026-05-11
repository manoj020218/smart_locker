import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AppSession } from "../types/api";
import { LabeledInput } from "../components/LabeledInput";

type Props = {
  session: AppSession;
};

type ProvisionStep = "idle" | "scanning" | "connected" | "writing" | "done" | "failed";

export const BleProvisionScreen = ({ session }: Props): React.JSX.Element => {
  const [deviceId, setDeviceId] = useState("");
  const [cabinetId, setCabinetId] = useState("");
  const [tenantId, setTenantId] = useState(session.tenantId || "");
  const [hwModel, setHwModel] = useState("esp32-c3");
  const [fwVersion, setFwVersion] = useState("1.0.0");
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [provisionKey, setProvisionKey] = useState("");
  const [step, setStep] = useState<ProvisionStep>("idle");
  const [note, setNote] = useState("Configure payload and start provisioning.");

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
        generated_by: "admin-apk-phase1-scaffold",
        generated_at: new Date().toISOString()
      }
    }),
    [session.baseUrl, deviceId, cabinetId, tenantId, hwModel, fwVersion, provisionKey, wifiSsid, wifiPassword]
  );

  const runSimulatedProvision = async (): Promise<void> => {
    setStep("scanning");
    setNote("Scanning BLE device...");
    await wait(550);
    setStep("connected");
    setNote("Device connected, validating payload...");
    await wait(550);
    if (!payload.device_register.device_id || !payload.device_register.cabinet_id || !payload.device_register.tenant_id) {
      setStep("failed");
      setNote("Required fields missing: device_id, cabinet_id, tenant_id.");
      return;
    }
    setStep("writing");
    setNote("Writing provisioning payload to EDGE over BLE...");
    await wait(800);
    setStep("done");
    setNote("Provision payload write simulated. Next step: bind actual BLE characteristic commands.");
  };

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.section}>
        <Text style={styles.title}>BLE Provisioning (Scaffold)</Text>
        <Text style={styles.meta}>API: {session.baseUrl}</Text>
        <Text style={styles.meta}>Status: {step.toUpperCase()}</Text>
        <Text style={styles.note}>{note}</Text>
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
        <Pressable style={styles.primaryButton} onPress={runSimulatedProvision}>
          <Text style={styles.primaryText}>Simulate BLE Provision</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

const wait = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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
    color: "#b8ffda",
    marginTop: 4,
    fontSize: 12
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
  primaryText: {
    color: "#ffffff",
    fontWeight: "700"
  }
});
