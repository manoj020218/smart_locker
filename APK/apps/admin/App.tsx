import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StatusBar as NativeStatusBar, StyleSheet, Text, View } from "react-native";
import { BleProvisionScreen } from "./src/screens/BleProvisionScreen";
import { CabinetAdminScreen } from "./src/screens/CabinetAdminScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { clearSession, loadSession, saveSession } from "./src/storage/session";
import type { AppSession } from "./src/types/api";

type AppTab = "dashboard" | "ble" | "cabinet_admin";
const TAB_BAR_BOTTOM_PADDING = Platform.OS === "android" ? 12 : 20;

export default function App(): React.JSX.Element {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AppSession | null>(null);
  const [tab, setTab] = useState<AppTab>("dashboard");
  const statusBarInset = Platform.OS === "android" ? (NativeStatusBar.currentHeight ?? 0) : 0;

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      const existing = await loadSession();
      setSession(existing);
      setBooting(false);
    };
    void bootstrap();
  }, []);

  const handleLogin = async (next: AppSession): Promise<void> => {
    await saveSession(next);
    setSession(next);
    setTab("dashboard");
  };

  const handleLogout = async (): Promise<void> => {
    await clearSession();
    setSession(null);
    setTab("dashboard");
  };

  const handleSessionInvalid = (): void => {
    void handleLogout();
  };

  if (booting) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {session ? (
        <View style={styles.authRoot}>
          <View style={[styles.screenArea, { paddingTop: statusBarInset }]}>
            {tab === "dashboard" ? (
              <DashboardScreen session={session} onLogout={handleLogout} onSessionInvalid={handleSessionInvalid} />
            ) : tab === "ble" ? (
              <BleProvisionScreen session={session} />
            ) : (
              <CabinetAdminScreen session={session} onSessionInvalid={handleSessionInvalid} />
            )}
          </View>
          <View style={[styles.tabBar, { paddingBottom: TAB_BAR_BOTTOM_PADDING }]}>
            <Pressable style={[styles.tab, tab === "dashboard" && styles.tabActive]} onPress={() => setTab("dashboard")}>
              <Text style={[styles.tabText, tab === "dashboard" && styles.tabTextActive]}>Operations</Text>
            </Pressable>
            <Pressable style={[styles.tab, tab === "ble" && styles.tabActive]} onPress={() => setTab("ble")}>
              <Text style={[styles.tabText, tab === "ble" && styles.tabTextActive]}>BLE Provision</Text>
            </Pressable>
            <Pressable style={[styles.tab, tab === "cabinet_admin" && styles.tabActive]} onPress={() => setTab("cabinet_admin")}>
              <Text style={[styles.tabText, tab === "cabinet_admin" && styles.tabTextActive]}>Cabinet Admin</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <LoginScreen onLogin={handleLogin} />
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a101a"
  },
  authRoot: {
    flex: 1
  },
  screenArea: {
    flex: 1
  },
  tabBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: "#0a101a",
    borderTopWidth: 1,
    borderTopColor: "#1c293c"
  },
  tab: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#38506f",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  tabActive: {
    backgroundColor: "#246efc",
    borderColor: "#246efc"
  },
  tabText: {
    color: "#cfe0fa",
    fontSize: 12,
    fontWeight: "700"
  },
  tabTextActive: {
    color: "#ffffff"
  },
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a101a"
  }
});
