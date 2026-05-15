import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, SmartLockerApiClient } from "../api/client";
import { LabeledInput } from "../components/LabeledInput";
import type { AppSession, CabinetHealthRow, ManufacturerDashboardResponse, ManufacturerOwnersResponse } from "../types/api";

type Props = {
  session: AppSession;
  onLogout: () => void;
  onSessionInvalid: () => void;
};

type CabinetWrapSummary = {
  cabinet_id: string;
  cabinet_name: string;
  location_name: string;
  total_lockers: number;
};

type OwnerWrapSummary = {
  owner_user_id: string;
  display_name: string;
  email: string;
  cabinet_ids: string[];
};

type DashboardWrapStore = {
  cabinetWrap: CabinetWrapSummary | null;
  ownerWrap: OwnerWrapSummary | null;
};

const WRAP_STORE_KEY = "smart_cabinet_admin_dashboard_wrap_v1";

export const DashboardScreen = ({ session, onLogout, onSessionInvalid }: Props): React.JSX.Element => {
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
  const [ownerPassword, setOwnerPassword] = useState("");
  const [assignCabinetId, setAssignCabinetId] = useState("");
  const [editingOwnerId, setEditingOwnerId] = useState("");
  const [cabinetWrap, setCabinetWrap] = useState<CabinetWrapSummary | null>(null);
  const [ownerWrap, setOwnerWrap] = useState<OwnerWrapSummary | null>(null);

  const persistWrap = async (nextCabinetWrap: CabinetWrapSummary | null, nextOwnerWrap: OwnerWrapSummary | null): Promise<void> => {
    const payload: DashboardWrapStore = {
      cabinetWrap: nextCabinetWrap,
      ownerWrap: nextOwnerWrap
    };
    await AsyncStorage.setItem(WRAP_STORE_KEY, JSON.stringify(payload));
  };

  useEffect(() => {
    const loadWrap = async (): Promise<void> => {
      try {
        const raw = await AsyncStorage.getItem(WRAP_STORE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<DashboardWrapStore>;
        if (parsed.cabinetWrap && typeof parsed.cabinetWrap.cabinet_id === "string") {
          setCabinetWrap(parsed.cabinetWrap);
        }
        if (parsed.ownerWrap && typeof parsed.ownerWrap.owner_user_id === "string") {
          setOwnerWrap(parsed.ownerWrap);
        }
      } catch {
        // Ignore corrupt local wrap cache.
      }
    };
    void loadWrap();
  }, []);

  const isAuthInvalid = (err: unknown): boolean => err instanceof ApiError && err.status === 401;

  const toMessage = (err: unknown, fallback: string): string => {
    if (err instanceof ApiError && err.code === "network_error") {
      return "Network unavailable. Check internet and retry.";
    }
    if (isAuthInvalid(err)) {
      return "Session expired or invalid bearer token. Please login again.";
    }
    return err instanceof Error ? err.message : fallback;
  };

  const refresh = async (opts: { silent?: boolean } = {}): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const [h, d, c, o] = await Promise.all([client.health(), client.dashboard(), client.cabinets(), client.owners()]);
      setHealth(`${h.ok ? "Connected" : "Error"} (${h.service})`);
      setDashboard(d.stats);
      setCabinets(c.cabinets);
      setOwners(o.owners);
      if (!opts.silent) {
        setFlash("Refreshed live data");
      }
    } catch (err) {
      if (isAuthInvalid(err)) {
        setError("Session expired or invalid bearer token. Please login again.");
        setHealth("Disconnected");
        onSessionInvalid();
        return;
      }
      const message = toMessage(err, "Refresh failed");
      setError(message);
      setHealth("Disconnected");
    } finally {
      setLoading(false);
    }
  };

  const beginCabinetEdit = (cab: CabinetWrapSummary): void => {
    setCabinetId(cab.cabinet_id);
    setCabinetName(cab.cabinet_name || cab.cabinet_id);
    setCabinetLocation(cab.location_name || "");
    setTotalLockers(String(cab.total_lockers || 24));
    setCabinetWrap(cab);
    void persistWrap(cab, ownerWrap);
    setFlash(`Editing cabinet ${cab.cabinet_id}`);
    setError("");
  };

  const beginCabinetEditById = (id: string): void => {
    const row = cabinets.find((cab) => cab.cabinet_id === id);
    if (row) {
      beginCabinetEdit({
        cabinet_id: row.cabinet_id,
        cabinet_name: row.cabinet_name,
        location_name: row.location_name,
        total_lockers: row.total_lockers
      });
      return;
    }
    if (cabinetWrap?.cabinet_id === id) {
      beginCabinetEdit(cabinetWrap);
    }
  };

  const handleDeleteCabinet = (id: string): void => {
    Alert.alert("Delete Cabinet", `Delete cabinet ${id}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setLoading(true);
            setError("");
            try {
              await client.deleteCabinet(id);
              if (cabinetWrap?.cabinet_id === id) {
                setCabinetWrap(null);
                void persistWrap(null, ownerWrap);
              }
              if (cabinetId.trim() === id) {
                setCabinetId("");
                setCabinetName("Demo Cabinet");
                setCabinetLocation("Demo Site");
                setTotalLockers("24");
              }
              if (assignCabinetId.trim() === id) {
                setAssignCabinetId("");
              }
              setFlash(`Cabinet ${id} deleted`);
              await refresh({ silent: true });
            } catch (err) {
              if (isAuthInvalid(err)) {
                setError("Session expired or invalid bearer token. Please login again.");
                onSessionInvalid();
                return;
              }
              setError(toMessage(err, "Cabinet delete failed"));
            } finally {
              setLoading(false);
            }
          })();
        }
      }
    ]);
  };

  const beginOwnerEdit = (owner: OwnerWrapSummary): void => {
    setEditingOwnerId(owner.owner_user_id);
    setOwnerDisplayName(owner.display_name || "Owner");
    setOwnerEmail(owner.email || "");
    setOwnerPassword("");
    setAssignCabinetId(owner.cabinet_ids[0] ?? "");
    setOwnerWrap(owner);
    void persistWrap(cabinetWrap, owner);
    setFlash(`Editing owner ${owner.owner_user_id}`);
    setError("");
  };

  const beginOwnerEditById = (id: string): void => {
    const row = owners.find((owner) => owner.owner_user_id === id);
    if (row) {
      beginOwnerEdit({
        owner_user_id: row.owner_user_id,
        display_name: row.display_name,
        email: row.email,
        cabinet_ids: row.cabinet_ids ?? []
      });
      return;
    }
    if (ownerWrap?.owner_user_id === id) {
      beginOwnerEdit(ownerWrap);
    }
  };

  const clearOwnerForm = (): void => {
    setEditingOwnerId("");
    setOwnerDisplayName("Demo Owner");
    setOwnerEmail("");
    setOwnerPassword("");
    setAssignCabinetId("");
  };

  const handleDeleteOwner = (ownerUserId: string): void => {
    Alert.alert("Delete Owner", `Delete owner ${ownerUserId}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setLoading(true);
            setError("");
            try {
              await client.deleteOwner(ownerUserId);
              if (ownerWrap?.owner_user_id === ownerUserId) {
                setOwnerWrap(null);
                void persistWrap(cabinetWrap, null);
              }
              if (editingOwnerId === ownerUserId) {
                clearOwnerForm();
              }
              setFlash(`Owner deleted: ${ownerUserId}`);
              await refresh({ silent: true });
            } catch (err) {
              if (isAuthInvalid(err)) {
                setError("Session expired or invalid bearer token. Please login again.");
                onSessionInvalid();
                return;
              }
              setError(toMessage(err, "Owner delete failed"));
            } finally {
              setLoading(false);
            }
          })();
        }
      }
    ]);
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
      const lockers = Math.max(1, Number(totalLockers || "24"));
      const isEdit = cabinets.some((cab) => cab.cabinet_id === id) || cabinetWrap?.cabinet_id === id;
      await client.registerCabinet({
        cabinet_id: id,
        cabinet_name: cabinetName.trim() || id,
        location_name: cabinetLocation.trim(),
        total_lockers: lockers,
        mode: "DEMO",
        access_modes: ["WIEGAND"]
      });
      setCabinetWrap({
        cabinet_id: id,
        cabinet_name: cabinetName.trim() || id,
        location_name: cabinetLocation.trim(),
        total_lockers: lockers
      });
      void persistWrap(
        {
          cabinet_id: id,
          cabinet_name: cabinetName.trim() || id,
          location_name: cabinetLocation.trim(),
          total_lockers: lockers
        },
        ownerWrap
      );
      setFlash(`Cabinet ${id} ${isEdit ? "updated" : "registered"}`);
      await refresh({ silent: true });
    } catch (err) {
      if (isAuthInvalid(err)) {
        setError("Session expired or invalid bearer token. Please login again.");
        onSessionInvalid();
        return;
      }
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
    const isEdit = editingOwnerId.trim().length > 0;
    if (!isEdit && ownerPassword.trim().length < 8) {
      setError("Owner password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const ownerUserId = editingOwnerId.trim();
      let targetOwnerId = ownerUserId;
      const assignCabinet = assignCabinetId.trim();
      if (isEdit) {
        await client.updateOwner(ownerUserId, {
          display_name: ownerDisplayName.trim() || "Owner",
          email,
          password: ownerPassword.trim() ? ownerPassword : undefined,
          cabinet_ids: assignCabinet ? [assignCabinet] : undefined
        });
      } else {
        const created = await client.createOwner({
          display_name: ownerDisplayName.trim() || "Owner",
          email,
          password: ownerPassword,
          cabinet_ids: assignCabinet ? [assignCabinet] : []
        });
        targetOwnerId = created.owner_user_id;
      }
      if (assignCabinet && targetOwnerId) {
        await client.assignOwner(assignCabinet, targetOwnerId);
      }
      const wrap: OwnerWrapSummary = {
        owner_user_id: targetOwnerId,
        display_name: ownerDisplayName.trim() || "Owner",
        email,
        cabinet_ids: assignCabinet ? [assignCabinet] : []
      };
      setOwnerWrap(wrap);
      void persistWrap(cabinetWrap, wrap);
      setEditingOwnerId(targetOwnerId);
      setFlash(`${isEdit ? "Owner updated" : "Owner created"}: ${targetOwnerId}`);
      await refresh({ silent: true });
    } catch (err) {
      if (isAuthInvalid(err)) {
        setError("Session expired or invalid bearer token. Please login again.");
        onSessionInvalid();
        return;
      }
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
        <Pressable style={styles.primaryButton} onPress={() => void refresh()} disabled={loading}>
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

      {cabinetWrap || ownerWrap ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Latest Wrap-up</Text>
          {cabinetWrap ? (
            <View style={styles.wrapCard}>
              <Text style={styles.wrapLabel}>Cabinet ID</Text>
              <Pressable onPress={() => beginCabinetEditById(cabinetWrap.cabinet_id)}>
                <Text style={styles.wrapId}>{cabinetWrap.cabinet_id}</Text>
              </Pressable>
              <View style={styles.rowActions}>
                <Pressable style={styles.editButton} onPress={() => beginCabinetEditById(cabinetWrap.cabinet_id)}>
                  <Text style={styles.rowActionText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.deleteButton} onPress={() => handleDeleteCabinet(cabinetWrap.cabinet_id)}>
                  <Text style={styles.rowActionText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {ownerWrap ? (
            <View style={styles.wrapCard}>
              <Text style={styles.wrapLabel}>Owner ID</Text>
              <Pressable onPress={() => beginOwnerEditById(ownerWrap.owner_user_id)}>
                <Text style={styles.wrapId}>{ownerWrap.owner_user_id}</Text>
              </Pressable>
              <View style={styles.rowActions}>
                <Pressable style={styles.editButton} onPress={() => beginOwnerEditById(ownerWrap.owner_user_id)}>
                  <Text style={styles.rowActionText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.deleteButton} onPress={() => handleDeleteOwner(ownerWrap.owner_user_id)}>
                  <Text style={styles.rowActionText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Register Cabinet</Text>
        <LabeledInput label="Cabinet ID" value={cabinetId} onChangeText={setCabinetId} placeholder="cab-demo-1001" />
        <LabeledInput label="Cabinet Name" value={cabinetName} onChangeText={setCabinetName} />
        <LabeledInput label="Location" value={cabinetLocation} onChangeText={setCabinetLocation} />
        <LabeledInput label="Total Lockers" value={totalLockers} onChangeText={setTotalLockers} placeholder="24" />
        <View style={styles.inlineActions}>
          <Pressable style={[styles.secondaryButton, styles.flexAction]} onPress={handleRegisterCabinet} disabled={loading}>
            <Text style={styles.secondaryText}>Create / Update Cabinet</Text>
          </Pressable>
          <Pressable
            style={styles.ghostButton}
            onPress={() => {
              setCabinetId("");
              setCabinetName("Demo Cabinet");
              setCabinetLocation("Demo Site");
              setTotalLockers("24");
            }}
            disabled={loading}
          >
            <Text style={styles.ghostText}>Clear</Text>
          </Pressable>
        </View>
        {cabinetWrap ? (
          <View style={styles.wrapCard}>
            <Text style={styles.wrapLabel}>Cabinet Wrap-up</Text>
            <Pressable onPress={() => beginCabinetEditById(cabinetWrap.cabinet_id)}>
              <Text style={styles.wrapId}>{cabinetWrap.cabinet_id}</Text>
            </Pressable>
            <Text style={styles.wrapMeta}>
              {cabinetWrap.cabinet_name} | {cabinetWrap.location_name || "-"} | Lockers: {cabinetWrap.total_lockers}
            </Text>
            <View style={styles.rowActions}>
              <Pressable style={styles.editButton} onPress={() => beginCabinetEditById(cabinetWrap.cabinet_id)}>
                <Text style={styles.rowActionText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.deleteButton} onPress={() => handleDeleteCabinet(cabinetWrap.cabinet_id)}>
                <Text style={styles.rowActionText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create Owner + Assign</Text>
        <LabeledInput label="Owner Display Name" value={ownerDisplayName} onChangeText={setOwnerDisplayName} />
        <LabeledInput label="Owner Email" value={ownerEmail} onChangeText={setOwnerEmail} placeholder="owner@demo.com" />
        <LabeledInput
          label={`Owner Password${editingOwnerId ? " (optional for update)" : ""}`}
          value={ownerPassword}
          onChangeText={setOwnerPassword}
          secureTextEntry
        />
        <LabeledInput label="Assign Cabinet ID (optional)" value={assignCabinetId} onChangeText={setAssignCabinetId} placeholder="cab-demo-1001" />
        <View style={styles.inlineActions}>
          <Pressable style={[styles.secondaryButton, styles.flexAction]} onPress={handleCreateOwner} disabled={loading}>
            <Text style={styles.secondaryText}>{editingOwnerId ? "Update Owner" : "Create Owner"}</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={clearOwnerForm} disabled={loading}>
            <Text style={styles.ghostText}>Clear</Text>
          </Pressable>
        </View>
        {ownerWrap ? (
          <View style={styles.wrapCard}>
            <Text style={styles.wrapLabel}>Owner Wrap-up</Text>
            <Pressable onPress={() => beginOwnerEditById(ownerWrap.owner_user_id)}>
              <Text style={styles.wrapId}>{ownerWrap.owner_user_id}</Text>
            </Pressable>
            <Text style={styles.wrapMeta}>
              {ownerWrap.display_name} | {ownerWrap.email}
            </Text>
            <Text style={styles.wrapMeta}>Cabinets: {ownerWrap.cabinet_ids.join(", ") || "-"}</Text>
            <View style={styles.rowActions}>
              <Pressable style={styles.editButton} onPress={() => beginOwnerEditById(ownerWrap.owner_user_id)}>
                <Text style={styles.rowActionText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.deleteButton} onPress={() => handleDeleteOwner(ownerWrap.owner_user_id)}>
                <Text style={styles.rowActionText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Latest Cabinets ({cabinets.length})</Text>
        {cabinets.slice(0, 8).map((cab) => (
          <View key={cab.cabinet_id} style={styles.row}>
            <Pressable onPress={() => beginCabinetEditById(cab.cabinet_id)}>
              <Text style={styles.rowTitle}>{cab.cabinet_id}</Text>
            </Pressable>
            <Text style={styles.rowSub}>{cab.cabinet_name}</Text>
            <Text style={styles.rowSub}>
              Status: {cab.health_status} | Owner: {cab.owner_id || "-"}
            </Text>
            <View style={styles.rowActions}>
              <Pressable style={styles.editButton} onPress={() => beginCabinetEditById(cab.cabinet_id)}>
                <Text style={styles.rowActionText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.deleteButton} onPress={() => handleDeleteCabinet(cab.cabinet_id)}>
                <Text style={styles.rowActionText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Latest Owners ({owners.length})</Text>
        {owners.slice(0, 8).map((owner) => (
          <View key={owner.owner_user_id} style={styles.row}>
            <Pressable onPress={() => beginOwnerEditById(owner.owner_user_id)}>
              <Text style={styles.rowTitle}>{owner.owner_user_id}</Text>
            </Pressable>
            <Text style={styles.rowSub}>{owner.email}</Text>
            <Text style={styles.rowSub}>Cabinets: {(owner.cabinet_ids || []).join(", ") || "-"}</Text>
            <View style={styles.rowActions}>
              <Pressable style={styles.editButton} onPress={() => beginOwnerEditById(owner.owner_user_id)}>
                <Text style={styles.rowActionText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.deleteButton} onPress={() => handleDeleteOwner(owner.owner_user_id)}>
                <Text style={styles.rowActionText}>Delete</Text>
              </Pressable>
            </View>
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
  inlineActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  flexAction: {
    flex: 1
  },
  ghostButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#395273",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  ghostText: {
    color: "#d9e8ff",
    fontWeight: "600"
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
  },
  wrapCard: {
    marginTop: 10,
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
  }
});
