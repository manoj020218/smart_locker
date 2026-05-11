import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, SmartLockerApiClient } from "../api/client";
import { LabeledInput } from "../components/LabeledInput";
import type { AppSession, CabinetHealthRow, ManufacturerDashboardResponse, ManufacturerOwnersResponse } from "../types/api";

type Props = {
  session: AppSession;
  onLogout: () => void;
};

export const DashboardScreen = ({ session, onLogout }: Props): React.JSX.Element => {
  const client = useMemo(() => new SmartLockerApiClient(session.baseUrl, session.token), [session.baseUrl, session.token]);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState("Not checked");
  const [dashboard, setDashboard] = useState<ManufacturerDashboardResponse["stats"] | null>(null);
  const [cabinets, setCabinets] = useState<CabinetHealthRow[]>([]);
  const [owners, setOwners] = useState<ManufacturerOwnersResponse["owners"]>([]);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  const [cabinetId, setCabinetId] = useState("");
  const [cabinetName, setCabinetName] = useState("Demo Cabinet");
  const [cabinetLocation, setCabinetLocation] = useState("Demo Site");
  const [totalLockers, setTotalLockers] = useState("24");

  const [ownerDisplayName, setOwnerDisplayName] = useState("Demo Owner");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("Owner#12345");
  const [assignCabinetId, setAssignCabinetId] = useState("");

  const toMessage = (err: unknown, fallback: string): string => {
    if (err instanceof ApiError && err.code === "network_error") {
      return "Network unavailable. Check internet and retry.";
    }
    return err instanceof Error ? err.message : fallback;
  };

  const refresh = async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const [h, d, c, o] = await Promise.all([client.health(), client.dashboard(), client.cabinets(), client.owners()]);
      setHealth(`${h.ok ? "Connected" : "Error"} (${h.service})`);
      setDashboard(d.stats);
      setCabinets(c.cabinets);
      setOwners(o.owners);
      setFlash("Refreshed live data");
    } catch (err) {
      const message = toMessage(err, "Refresh failed");
      setError(message);
      setHealth("Disconnected");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterCabinet = async (): Promise<void> => {
    const id = cabinetId.trim();
    if (!id) {
      setError("Cabinet ID is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await client.registerCabinet({
        cabinet_id: id,
        cabinet_name: cabinetName.trim() || id,
        location_name: cabinetLocation.trim(),
        total_lockers: Math.max(1, Number(totalLockers || "24")),
        mode: "DEMO",
        access_modes: ["WIEGAND"]
      });
      setFlash(`Cabinet ${id} registered`);
      await refresh();
    } catch (err) {
      const message = toMessage(err, "Cabinet register failed");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOwner = async (): Promise<void> => {
    const email = ownerEmail.trim().toLowerCase();
    if (!email) {
      setError("Owner email is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const created = await client.createOwner({
        display_name: ownerDisplayName.trim() || "Owner",
        email,
        password: ownerPassword,
        cabinet_ids: assignCabinetId.trim() ? [assignCabinetId.trim()] : []
      });
      if (assignCabinetId.trim()) {
        await client.assignOwner(assignCabinetId.trim(), created.owner_user_id);
      }
      setFlash(`Owner created: ${created.owner_user_id}`);
      await refresh();
    } catch (err) {
      const message = toMessage(err, "Owner create failed");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.topMeta}>
          <Text style={styles.title}>Manufacturer Console</Text>
          <Text style={styles.meta}>MFR: {session.manufacturerId || "-"}</Text>
          <Text style={styles.meta}>Tenant: {session.tenantId || "-"}</Text>
          <Text style={styles.meta}>API: {session.baseUrl}</Text>
        </View>
        <Pressable style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable style={styles.primaryButton} onPress={refresh} disabled={loading}>
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Refresh Live Status</Text>}
        </Pressable>
        <Text style={styles.healthText}>VPS: {health}</Text>
        {!!flash && <Text style={styles.okText}>{flash}</Text>}
        {!!error && <Text style={styles.errText}>{error}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fleet Snapshot</Text>
        <Text style={styles.meta}>Total Cabinets: {dashboard?.total_cabinets ?? 0}</Text>
        <Text style={styles.meta}>Online: {dashboard?.online_cabinets ?? 0}</Text>
        <Text style={styles.meta}>Offline: {dashboard?.offline_cabinets ?? 0}</Text>
        <Text style={styles.meta}>Never Seen: {dashboard?.never_seen_cabinets ?? 0}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Register Cabinet</Text>
        <LabeledInput label="Cabinet ID" value={cabinetId} onChangeText={setCabinetId} placeholder="cab-demo-1001" />
        <LabeledInput label="Cabinet Name" value={cabinetName} onChangeText={setCabinetName} />
        <LabeledInput label="Location" value={cabinetLocation} onChangeText={setCabinetLocation} />
        <LabeledInput label="Total Lockers" value={totalLockers} onChangeText={setTotalLockers} placeholder="24" />
        <Pressable style={styles.secondaryButton} onPress={handleRegisterCabinet} disabled={loading}>
          <Text style={styles.secondaryText}>Create Cabinet</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create Owner + Assign</Text>
        <LabeledInput label="Owner Display Name" value={ownerDisplayName} onChangeText={setOwnerDisplayName} />
        <LabeledInput label="Owner Email" value={ownerEmail} onChangeText={setOwnerEmail} placeholder="owner@demo.com" />
        <LabeledInput label="Owner Password" value={ownerPassword} onChangeText={setOwnerPassword} secureTextEntry />
        <LabeledInput label="Assign Cabinet ID (optional)" value={assignCabinetId} onChangeText={setAssignCabinetId} placeholder="cab-demo-1001" />
        <Pressable style={styles.secondaryButton} onPress={handleCreateOwner} disabled={loading}>
          <Text style={styles.secondaryText}>Create Owner</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Latest Cabinets ({cabinets.length})</Text>
        {cabinets.slice(0, 8).map((cab) => (
          <View key={cab.cabinet_id} style={styles.row}>
            <Text style={styles.rowTitle}>{cab.cabinet_id}</Text>
            <Text style={styles.rowSub}>{cab.cabinet_name}</Text>
            <Text style={styles.rowSub}>
              Status: {cab.health_status} | Owner: {cab.owner_id || "-"}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Latest Owners ({owners.length})</Text>
        {owners.slice(0, 8).map((owner) => (
          <View key={owner.owner_user_id} style={styles.row}>
            <Text style={styles.rowTitle}>{owner.owner_user_id}</Text>
            <Text style={styles.rowSub}>{owner.email}</Text>
            <Text style={styles.rowSub}>Cabinets: {(owner.cabinet_ids || []).join(", ") || "-"}</Text>
          </View>
        ))}
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
  topBar: {
    borderWidth: 1,
    borderColor: "#1e2b3c",
    borderRadius: 14,
    backgroundColor: "#0f1826",
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between"
  },
  topMeta: {
    flexShrink: 1,
    paddingRight: 12
  },
  title: {
    color: "#f5f8ff",
    fontWeight: "700",
    fontSize: 21,
    marginBottom: 8
  },
  meta: {
    color: "#9fb0cb",
    fontSize: 12,
    marginBottom: 3
  },
  logoutButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#41556f",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  logoutText: {
    color: "#dce8ff",
    fontWeight: "600"
  },
  section: {
    borderWidth: 1,
    borderColor: "#1e2b3c",
    borderRadius: 14,
    backgroundColor: "#0f1826",
    padding: 14,
    marginBottom: 12
  },
  sectionTitle: {
    color: "#f2f7ff",
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 10
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: "#1f8f5e",
    alignItems: "center",
    paddingVertical: 11,
    marginBottom: 8
  },
  primaryText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  secondaryButton: {
    borderRadius: 10,
    backgroundColor: "#246efc",
    alignItems: "center",
    paddingVertical: 11
  },
  secondaryText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  healthText: {
    color: "#dbe8ff",
    fontSize: 12
  },
  okText: {
    color: "#7be3ae",
    marginTop: 6
  },
  errText: {
    color: "#ff9e9e",
    marginTop: 6
  },
  row: {
    borderTopWidth: 1,
    borderTopColor: "#26364b",
    paddingTop: 8,
    marginTop: 8
  },
  rowTitle: {
    color: "#e5efff",
    fontWeight: "700",
    fontSize: 13
  },
  rowSub: {
    color: "#a7b7cf",
    fontSize: 12,
    marginTop: 1
  }
});
