import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { BleProvisionScreen } from "./src/screens/BleProvisionScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { clearSession, loadSession, saveSession } from "./src/storage/session";
import type { AppSession } from "./src/types/api";

type AppTab = "dashboard" | "ble";

export default function App(): React.JSX.Element {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AppSession | null>(null);
  const [tab, setTab] = useState<AppTab>("dashboard");

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
          <View style={styles.tabBar}>
            <Pressable style={[styles.tab, tab === "dashboard" && styles.tabActive]} onPress={() => setTab("dashboard")}>
              <Text style={[styles.tabText, tab === "dashboard" && styles.tabTextActive]}>Operations</Text>
            </Pressable>
            <Pressable style={[styles.tab, tab === "ble" && styles.tabActive]} onPress={() => setTab("ble")}>
              <Text style={[styles.tabText, tab === "ble" && styles.tabTextActive]}>BLE Provision</Text>
            </Pressable>
          </View>
          {tab === "dashboard" ? <DashboardScreen session={session} onLogout={handleLogout} /> : <BleProvisionScreen session={session} />}
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
  tabBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: "#0a101a",
    borderBottomWidth: 1,
    borderBottomColor: "#1c293c"
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
