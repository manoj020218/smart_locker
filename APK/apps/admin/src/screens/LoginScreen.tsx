import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError, SmartLockerApiClient } from "../api/client";
import { LabeledInput } from "../components/LabeledInput";
import { DEFAULT_API_BASE_URL } from "../config";
import type { AppSession } from "../types/api";

type Props = {
  onLogin: (session: AppSession) => void;
};

export const LoginScreen = ({ onLogin }: Props): React.JSX.Element => {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [identifier, setIdentifier] = useState("mfr.demo.smarthub@iotsoft.in");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(
    () => baseUrl.trim().length > 8 && identifier.trim().length > 3 && password.trim().length > 5 && !loading,
    [baseUrl, identifier, password, loading]
  );

  const handleLogin = async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const client = new SmartLockerApiClient(baseUrl);
      const login = await client.login(identifier.trim(), password);
      client.setToken(login.token);
      const me = await client.me();
      const permissions = login.permissions ?? login.allowed_permissions ?? [];
      const session: AppSession = {
        baseUrl: client.baseUrl,
        token: login.token,
        identifier: identifier.trim(),
        manufacturerId: me.profile.manufacturer_id,
        tenantId: me.profile.tenant_id,
        role: me.profile.role,
        permissions,
        cabinetIds: me.profile.cabinet_ids ?? [],
        ownerId: me.profile.owner_id ?? "",
        displayName: me.profile.display_name ?? ""
      };
      onLogin(session);
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === "network_error"
          ? "No internet / timeout. Check connectivity and retry."
          : err instanceof Error
            ? err.message
            : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Smart Cabinet Admin</Text>
      <Text style={styles.subtitle}>Role-based credential login</Text>

      <LabeledInput label="API Base URL" value={baseUrl} onChangeText={setBaseUrl} placeholder="https://smartlocker.iotsoft.in" />
      <LabeledInput label="Identifier (Email/Mobile)" value={identifier} onChangeText={setIdentifier} placeholder="mfr@example.com" />
      <LabeledInput label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Enter password" />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Pressable disabled={!canSubmit} style={[styles.button, !canSubmit && styles.buttonDisabled]} onPress={handleLogin}>
        {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Login</Text>}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0b111b",
    paddingHorizontal: 20,
    paddingTop: 68
  },
  title: {
    color: "#f2f7ff",
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 6
  },
  subtitle: {
    color: "#9fb0cb",
    fontSize: 14,
    marginBottom: 22
  },
  button: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: "#2472ff",
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonDisabled: {
    opacity: 0.45
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  error: {
    color: "#ff8f8f",
    marginTop: 2,
    marginBottom: 8
  }
});
