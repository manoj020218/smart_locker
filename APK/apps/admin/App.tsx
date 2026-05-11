import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { clearSession, loadSession, saveSession } from "./src/storage/session";
import type { AppSession } from "./src/types/api";

export default function App(): React.JSX.Element {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AppSession | null>(null);

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
  };

  const handleLogout = async (): Promise<void> => {
    await clearSession();
    setSession(null);
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
      {session ? <DashboardScreen session={session} onLogout={handleLogout} /> : <LoginScreen onLogin={handleLogin} />}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a101a"
  },
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a101a"
  }
});
