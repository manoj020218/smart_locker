import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, SmartLockerApiClient } from "../api/client";
import { LabeledInput } from "../components/LabeledInput";
import type { AdminDrawer, AdminRule, AdminUser, AppSession } from "../types/api";

type Props = {
  session: AppSession;
  onSessionInvalid: () => void;
};

type UserForm = {
  userId: string;
  displayName: string;
  cardId: string;
  faceId: string;
  drawerId: string;
  validFrom: string;
  validTo: string;
  paymentRequired: boolean;
};

type RuleForm = {
  ruleId: string;
  userId: string;
  drawerId: string;
  validFrom: string;
  validTo: string;
  cooldownSec: string;
  paymentRequired: boolean;
};

type DrawerForm = {
  drawerId: string;
  boardAddress: string;
  lockAddress: string;
  label: string;
};

const emptyUserForm: UserForm = {
  userId: "",
  displayName: "",
  cardId: "",
  faceId: "",
  drawerId: "",
  validFrom: "",
  validTo: "",
  paymentRequired: false
};

const emptyRuleForm: RuleForm = {
  ruleId: "",
  userId: "",
  drawerId: "",
  validFrom: "",
  validTo: "",
  cooldownSec: "28800",
  paymentRequired: false
};

const emptyDrawerForm: DrawerForm = {
  drawerId: "",
  boardAddress: "",
  lockAddress: "",
  label: ""
};

const asOptionalInt = (value: string): number | undefined => {
  const raw = value.trim();
  if (!raw) return undefined;
  const num = Number.parseInt(raw, 10);
  return Number.isInteger(num) && num >= 0 ? num : undefined;
};

const asRequiredPositiveInt = (value: string): number => {
  const num = Number.parseInt(value.trim(), 10);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error("A positive integer is required");
  }
  return num;
};

export const CabinetAdminScreen = ({ session, onSessionInvalid }: Props): React.JSX.Element => {
  const client = useMemo(() => new SmartLockerApiClient(session.baseUrl, session.token), [session.baseUrl, session.token]);
  const role = (session.role ?? "").trim().toLowerCase();
  const roleCanUseAdminApi = ["admin", "cabinet_admin", "super_admin", "manufacturer"].includes(role);
  const [tenantId, setTenantId] = useState(session.tenantId || "");
  const [cabinetId, setCabinetId] = useState((session.cabinetIds?.[0] ?? "").trim());
  const [configVersion, setConfigVersion] = useState(0);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [rules, setRules] = useState<AdminRule[]>([]);
  const [drawers, setDrawers] = useState<AdminDrawer[]>([]);

  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm);
  const [drawerForm, setDrawerForm] = useState<DrawerForm>(emptyDrawerForm);

  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const busy = busyAction.length > 0;

  const toMessage = (err: unknown, fallback: string): string => {
    if (err instanceof ApiError && err.code === "network_error") {
      return "Network unavailable. Check internet and retry.";
    }
    if (err instanceof ApiError && err.status === 401) {
      onSessionInvalid();
      return "Session expired or invalid bearer token. Please login again.";
    }
    if (err instanceof ApiError && err.status === 403) {
      if ((err.message || "").toLowerCase().includes("insufficient role permission")) {
        const role = session.role?.trim() || "unknown";
        return `403: ${err.message}. Logged role="${role}". Please login with admin/cabinet_admin credentials for Cabinet Admin tab.`;
      }
      return `403: ${err.message}`;
    }
    return err instanceof Error ? err.message : fallback;
  };

  const withScope = (): { tenantId: string; cabinetId: string } => {
    const tenant = tenantId.trim();
    const cabinet = cabinetId.trim();
    if (!tenant || !cabinet) {
      throw new Error("tenant_id and cabinet_id are required");
    }
    return { tenantId: tenant, cabinetId: cabinet };
  };

  const runAction = async (label: string, task: () => Promise<void>): Promise<void> => {
    setBusyAction(label);
    setError("");
    setFlash("");
    try {
      await task();
    } catch (err) {
      setError(toMessage(err, `${label} failed`));
    } finally {
      setBusyAction("");
    }
  };

  const loadConfig = async (): Promise<void> => {
    await runAction("Loading cabinet config", async () => {
      const scope = withScope();
      const snapshot = await client.fetchAdminCabinetConfig(scope.tenantId, scope.cabinetId);
      setUsers(snapshot.users);
      setRules(snapshot.rules);
      setDrawers(snapshot.drawers);
      setConfigVersion(snapshot.config_version);
      setFlash(`Loaded config v${snapshot.config_version}`);
    });
  };

  const saveUser = async (): Promise<void> => {
    await runAction("Saving user", async () => {
      const scope = withScope();
      const displayName = userForm.displayName.trim();
      if (!displayName) throw new Error("User display name is required");

      const drawer = asOptionalInt(userForm.drawerId);
      if (userForm.drawerId.trim() && drawer === undefined) {
        throw new Error("drawer_id must be a valid non-negative integer");
      }
      const validFrom = asOptionalInt(userForm.validFrom);
      if (userForm.validFrom.trim() && validFrom === undefined) {
        throw new Error("valid_from must be a valid non-negative integer");
      }
      const validTo = asOptionalInt(userForm.validTo);
      if (userForm.validTo.trim() && validTo === undefined) {
        throw new Error("valid_to must be a valid non-negative integer");
      }

      const userId = userForm.userId.trim();
      const existing = userId ? users.some((u) => u.user_id === userId) : false;
      if (existing) {
        await client.updateAdminUser(userId, {
          tenant_id: scope.tenantId,
          cabinet_id: scope.cabinetId,
          display_name: displayName,
          card_id: userForm.cardId.trim() || undefined,
          face_id: userForm.faceId.trim() || undefined,
          drawer_id: userForm.drawerId.trim() ? drawer : null,
          valid_from: validFrom,
          valid_to: validTo,
          payment_required: userForm.paymentRequired
        });
        setFlash(`Updated user ${userId}`);
      } else {
        await client.createAdminUser({
          tenant_id: scope.tenantId,
          cabinet_id: scope.cabinetId,
          user_id: userId || undefined,
          display_name: displayName,
          card_id: userForm.cardId.trim() || undefined,
          face_id: userForm.faceId.trim() || undefined,
          drawer_id: drawer,
          valid_from: validFrom,
          valid_to: validTo,
          payment_required: userForm.paymentRequired
        });
        setFlash(userId ? `Created user ${userId}` : "Created user");
      }

      await loadConfig();
      setUserForm(emptyUserForm);
    });
  };

  const editUser = (user: AdminUser): void => {
    setUserForm({
      userId: user.user_id,
      displayName: user.display_name ?? "",
      cardId: user.card_id ?? "",
      faceId: user.face_id ?? "",
      drawerId: user.drawer_id !== undefined && user.drawer_id !== null ? String(user.drawer_id) : "",
      validFrom: user.valid_from !== undefined ? String(user.valid_from) : "",
      validTo: user.valid_to !== undefined ? String(user.valid_to) : "",
      paymentRequired: !!user.payment_required
    });
  };

  const deleteUser = (user: AdminUser): void => {
    Alert.alert("Delete user", `Delete ${user.user_id}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void runAction("Deleting user", async () => {
            const scope = withScope();
            await client.deleteAdminUser(user.user_id, scope.tenantId, scope.cabinetId);
            setFlash(`Deleted user ${user.user_id}`);
            await loadConfig();
          });
        }
      }
    ]);
  };

  const saveRule = async (): Promise<void> => {
    await runAction("Saving rule", async () => {
      const scope = withScope();
      const userId = ruleForm.userId.trim();
      if (!userId) throw new Error("rule user_id is required");
      if (!ruleForm.drawerId.trim()) throw new Error("rule drawer_id is required");

      const drawer = asOptionalInt(ruleForm.drawerId);
      if (drawer === undefined) throw new Error("rule drawer_id must be a valid non-negative integer");

      const validFrom = asOptionalInt(ruleForm.validFrom);
      if (ruleForm.validFrom.trim() && validFrom === undefined) {
        throw new Error("rule valid_from must be a valid non-negative integer");
      }
      const validTo = asOptionalInt(ruleForm.validTo);
      if (ruleForm.validTo.trim() && validTo === undefined) {
        throw new Error("rule valid_to must be a valid non-negative integer");
      }

      const cooldown = asOptionalInt(ruleForm.cooldownSec);
      if (ruleForm.cooldownSec.trim() && cooldown === undefined) {
        throw new Error("rule cooldown_sec must be a valid non-negative integer");
      }

      const ruleId = ruleForm.ruleId.trim();
      const existing = ruleId ? rules.some((r) => r.rule_id === ruleId) : false;
      if (existing) {
        await client.updateAdminRule(ruleId, {
          tenant_id: scope.tenantId,
          cabinet_id: scope.cabinetId,
          user_id: userId,
          drawer_id: drawer,
          valid_from: validFrom,
          valid_to: validTo,
          cooldown_sec: cooldown,
          payment_required: ruleForm.paymentRequired
        });
        setFlash(`Updated rule ${ruleId}`);
      } else {
        await client.createAdminRule({
          tenant_id: scope.tenantId,
          cabinet_id: scope.cabinetId,
          rule_id: ruleId || undefined,
          user_id: userId,
          drawer_id: drawer,
          valid_from: validFrom,
          valid_to: validTo,
          cooldown_sec: cooldown,
          payment_required: ruleForm.paymentRequired
        });
        setFlash(ruleId ? `Created rule ${ruleId}` : "Created rule");
      }

      await loadConfig();
      setRuleForm(emptyRuleForm);
    });
  };

  const editRule = (rule: AdminRule): void => {
    setRuleForm({
      ruleId: rule.rule_id,
      userId: rule.user_id,
      drawerId: String(rule.drawer_id),
      validFrom: rule.valid_from !== undefined ? String(rule.valid_from) : "",
      validTo: rule.valid_to !== undefined ? String(rule.valid_to) : "",
      cooldownSec: rule.cooldown_sec !== undefined ? String(rule.cooldown_sec) : "",
      paymentRequired: !!rule.payment_required
    });
  };

  const deleteRule = (rule: AdminRule): void => {
    Alert.alert("Delete rule", `Delete ${rule.rule_id}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void runAction("Deleting rule", async () => {
            const scope = withScope();
            await client.deleteAdminRule(rule.rule_id, scope.tenantId, scope.cabinetId);
            setFlash(`Deleted rule ${rule.rule_id}`);
            await loadConfig();
          });
        }
      }
    ]);
  };

  const saveDrawer = async (): Promise<void> => {
    await runAction("Saving drawer", async () => {
      const scope = withScope();
      const drawerId = asRequiredPositiveInt(drawerForm.drawerId);
      const boardAddress = asOptionalInt(drawerForm.boardAddress);
      const lockAddress = asOptionalInt(drawerForm.lockAddress);
      if (boardAddress === undefined || lockAddress === undefined) {
        throw new Error("board_address and lock_address are required non-negative integers");
      }

      const existing = drawers.some((d) => d.drawer_id === drawerId);
      if (existing) {
        await client.updateAdminDrawer(drawerId, {
          tenant_id: scope.tenantId,
          cabinet_id: scope.cabinetId,
          board_address: boardAddress,
          lock_address: lockAddress,
          label: drawerForm.label.trim() || undefined
        });
        setFlash(`Updated drawer ${drawerId}`);
      } else {
        await client.createAdminDrawer({
          tenant_id: scope.tenantId,
          cabinet_id: scope.cabinetId,
          drawer_id: drawerId,
          board_address: boardAddress,
          lock_address: lockAddress,
          label: drawerForm.label.trim() || undefined
        });
        setFlash(`Created drawer ${drawerId}`);
      }

      await loadConfig();
      setDrawerForm(emptyDrawerForm);
    });
  };

  const editDrawer = (drawer: AdminDrawer): void => {
    setDrawerForm({
      drawerId: String(drawer.drawer_id),
      boardAddress: String(drawer.board_address),
      lockAddress: String(drawer.lock_address),
      label: drawer.label ?? ""
    });
  };

  const deleteDrawer = (drawer: AdminDrawer): void => {
    Alert.alert("Delete drawer", `Delete drawer ${drawer.drawer_id}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void runAction("Deleting drawer", async () => {
            const scope = withScope();
            await client.deleteAdminDrawer(drawer.drawer_id, scope.tenantId, scope.cabinetId);
            setFlash(`Deleted drawer ${drawer.drawer_id}`);
            await loadConfig();
          });
        }
      }
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.section}>
        <Text style={styles.title}>Cabinet Admin</Text>
        <Text style={styles.meta}>API: {session.baseUrl}</Text>
        <Text style={styles.meta}>Role: {session.role || "-"}</Text>
        <Text style={styles.meta}>Tenant: {tenantId || "-"}</Text>
        <Text style={styles.meta}>Cabinet: {cabinetId || "-"}</Text>
        <Text style={styles.meta}>Config Version: {configVersion}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cabinet Scope</Text>
        <Text style={styles.helperText}>
          Select the target tenant + cabinet first. All load/save actions below will apply only to this selected cabinet.
        </Text>
        {!roleCanUseAdminApi ? (
          <Text style={styles.warnText}>Current role may not access Admin APIs. Please use admin/cabinet_admin login.</Text>
        ) : null}
        <LabeledInput label="Tenant ID" value={tenantId} onChangeText={setTenantId} placeholder="tenant-001" />
        <LabeledInput label="Cabinet ID" value={cabinetId} onChangeText={setCabinetId} placeholder="cab-1001" />
        <Pressable style={styles.primaryButton} disabled={busy} onPress={loadConfig}>
          {busyAction === "Loading cabinet config" ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Load Config Snapshot</Text>}
        </Pressable>
        {!!flash && <Text style={styles.okText}>{flash}</Text>}
        {!!error && <Text style={styles.errText}>{error}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Users ({users.length})</Text>
        <Text style={styles.helperText}>
          Create or update cabinet users here. Each user can be mapped to card/face and optionally pinned to a fixed drawer.
        </Text>
        <LabeledInput label="User ID (optional for create)" value={userForm.userId} onChangeText={(v) => setUserForm((s) => ({ ...s, userId: v }))} />
        <LabeledInput label="Display Name" value={userForm.displayName} onChangeText={(v) => setUserForm((s) => ({ ...s, displayName: v }))} />
        <LabeledInput label="Card ID" value={userForm.cardId} onChangeText={(v) => setUserForm((s) => ({ ...s, cardId: v }))} />
        <LabeledInput label="Face ID" value={userForm.faceId} onChangeText={(v) => setUserForm((s) => ({ ...s, faceId: v }))} />
        <LabeledInput label="Drawer ID" value={userForm.drawerId} onChangeText={(v) => setUserForm((s) => ({ ...s, drawerId: v }))} />
        <LabeledInput label="Valid From (epoch sec)" value={userForm.validFrom} onChangeText={(v) => setUserForm((s) => ({ ...s, validFrom: v }))} />
        <LabeledInput label="Valid To (epoch sec)" value={userForm.validTo} onChangeText={(v) => setUserForm((s) => ({ ...s, validTo: v }))} />
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Payment Required</Text>
          <Pressable
            style={[styles.toggleButton, userForm.paymentRequired ? styles.toggleActive : undefined]}
            onPress={() => setUserForm((s) => ({ ...s, paymentRequired: !s.paymentRequired }))}
          >
            <Text style={styles.toggleText}>{userForm.paymentRequired ? "YES" : "NO"}</Text>
          </Pressable>
        </View>
        <View style={styles.inlineActions}>
          <Pressable style={styles.secondaryButton} disabled={busy} onPress={() => void saveUser()}>
            {busyAction === "Saving user" ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.secondaryText}>Save User</Text>}
          </Pressable>
          <Pressable style={styles.ghostButton} disabled={busy} onPress={() => setUserForm(emptyUserForm)}>
            <Text style={styles.ghostText}>Clear</Text>
          </Pressable>
        </View>
        {users.slice(0, 40).map((u) => (
          <View key={u.user_id} style={styles.itemRow}>
            <Text style={styles.itemTitle}>{u.user_id}</Text>
            <Text style={styles.itemSub}>Name: {u.display_name || "-"}</Text>
            <Text style={styles.itemSub}>
              Card: {u.card_id || "-"} | Face: {u.face_id || "-"} | Drawer: {u.drawer_id ?? "-"}
            </Text>
            <View style={styles.rowActions}>
              <Pressable style={styles.editButton} onPress={() => editUser(u)}>
                <Text style={styles.rowActionText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.deleteButton} onPress={() => deleteUser(u)}>
                <Text style={styles.rowActionText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rules ({rules.length})</Text>
        <Text style={styles.helperText}>
          Rules define who can open which drawer, with validity window, cooldown, and payment requirement controls.
        </Text>
        <LabeledInput label="Rule ID (optional for create)" value={ruleForm.ruleId} onChangeText={(v) => setRuleForm((s) => ({ ...s, ruleId: v }))} />
        <LabeledInput label="User ID" value={ruleForm.userId} onChangeText={(v) => setRuleForm((s) => ({ ...s, userId: v }))} />
        <LabeledInput label="Drawer ID" value={ruleForm.drawerId} onChangeText={(v) => setRuleForm((s) => ({ ...s, drawerId: v }))} />
        <LabeledInput label="Valid From (epoch sec)" value={ruleForm.validFrom} onChangeText={(v) => setRuleForm((s) => ({ ...s, validFrom: v }))} />
        <LabeledInput label="Valid To (epoch sec)" value={ruleForm.validTo} onChangeText={(v) => setRuleForm((s) => ({ ...s, validTo: v }))} />
        <LabeledInput label="Cooldown Sec" value={ruleForm.cooldownSec} onChangeText={(v) => setRuleForm((s) => ({ ...s, cooldownSec: v }))} />
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Payment Required</Text>
          <Pressable
            style={[styles.toggleButton, ruleForm.paymentRequired ? styles.toggleActive : undefined]}
            onPress={() => setRuleForm((s) => ({ ...s, paymentRequired: !s.paymentRequired }))}
          >
            <Text style={styles.toggleText}>{ruleForm.paymentRequired ? "YES" : "NO"}</Text>
          </Pressable>
        </View>
        <View style={styles.inlineActions}>
          <Pressable style={styles.secondaryButton} disabled={busy} onPress={() => void saveRule()}>
            {busyAction === "Saving rule" ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.secondaryText}>Save Rule</Text>}
          </Pressable>
          <Pressable style={styles.ghostButton} disabled={busy} onPress={() => setRuleForm(emptyRuleForm)}>
            <Text style={styles.ghostText}>Clear</Text>
          </Pressable>
        </View>
        {rules.slice(0, 40).map((r) => (
          <View key={r.rule_id} style={styles.itemRow}>
            <Text style={styles.itemTitle}>{r.rule_id}</Text>
            <Text style={styles.itemSub}>
              User: {r.user_id} | Drawer: {r.drawer_id}
            </Text>
            <Text style={styles.itemSub}>
              Cooldown: {r.cooldown_sec}s | Pay: {r.payment_required ? "YES" : "NO"}
            </Text>
            <View style={styles.rowActions}>
              <Pressable style={styles.editButton} onPress={() => editRule(r)}>
                <Text style={styles.rowActionText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.deleteButton} onPress={() => deleteRule(r)}>
                <Text style={styles.rowActionText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Drawers ({drawers.length})</Text>
        <Text style={styles.helperText}>
          Drawer mapping links logical drawer IDs to hardware board/lock addresses used by the edge controller.
        </Text>
        <LabeledInput label="Drawer ID" value={drawerForm.drawerId} onChangeText={(v) => setDrawerForm((s) => ({ ...s, drawerId: v }))} />
        <LabeledInput
          label="Board Address"
          value={drawerForm.boardAddress}
          onChangeText={(v) => setDrawerForm((s) => ({ ...s, boardAddress: v }))}
        />
        <LabeledInput label="Lock Address" value={drawerForm.lockAddress} onChangeText={(v) => setDrawerForm((s) => ({ ...s, lockAddress: v }))} />
        <LabeledInput label="Label" value={drawerForm.label} onChangeText={(v) => setDrawerForm((s) => ({ ...s, label: v }))} />
        <View style={styles.inlineActions}>
          <Pressable style={styles.secondaryButton} disabled={busy} onPress={() => void saveDrawer()}>
            {busyAction === "Saving drawer" ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.secondaryText}>Save Drawer</Text>}
          </Pressable>
          <Pressable style={styles.ghostButton} disabled={busy} onPress={() => setDrawerForm(emptyDrawerForm)}>
            <Text style={styles.ghostText}>Clear</Text>
          </Pressable>
        </View>
        {drawers.slice(0, 60).map((d) => (
          <View key={`${d.cabinet_id}-${d.drawer_id}`} style={styles.itemRow}>
            <Text style={styles.itemTitle}>Drawer {d.drawer_id}</Text>
            <Text style={styles.itemSub}>
              Board: {d.board_address} | Lock: {d.lock_address}
            </Text>
            <Text style={styles.itemSub}>Label: {d.label || `Drawer ${d.drawer_id}`}</Text>
            <View style={styles.rowActions}>
              <Pressable style={styles.editButton} onPress={() => editDrawer(d)}>
                <Text style={styles.rowActionText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.deleteButton} onPress={() => deleteDrawer(d)}>
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
    marginBottom: 3
  },
  helperText: {
    color: "#9ab2d7",
    fontSize: 12,
    marginTop: -2,
    marginBottom: 10,
    lineHeight: 16
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: "#1f8f5e",
    alignItems: "center",
    paddingVertical: 11,
    marginTop: 6
  },
  primaryText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  secondaryButton: {
    borderRadius: 10,
    backgroundColor: "#246efc",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 128
  },
  secondaryText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  ghostButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#375173",
    paddingVertical: 10,
    paddingHorizontal: 16
  },
  ghostText: {
    color: "#d9e8ff",
    fontWeight: "600"
  },
  okText: {
    color: "#7be3ae",
    marginTop: 8
  },
  errText: {
    color: "#ff9e9e",
    marginTop: 8
  },
  warnText: {
    color: "#ffcf8a",
    marginBottom: 8
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: 12
  },
  toggleLabel: {
    color: "#dbe6ff",
    fontSize: 13
  },
  toggleButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#3f4d63",
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  toggleActive: {
    borderColor: "#30a56e",
    backgroundColor: "#1c5036"
  },
  toggleText: {
    color: "#f3f8ff",
    fontWeight: "700",
    fontSize: 12
  },
  inlineActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8
  },
  itemRow: {
    borderTopWidth: 1,
    borderTopColor: "#24364b",
    paddingTop: 8,
    marginTop: 8
  },
  itemTitle: {
    color: "#e5efff",
    fontWeight: "700",
    fontSize: 13
  },
  itemSub: {
    color: "#a7b7cf",
    fontSize: 12,
    marginTop: 1
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
