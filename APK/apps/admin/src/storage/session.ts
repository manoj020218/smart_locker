import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppSession } from "../types/api";

const SESSION_KEY = "smart_cabinet_admin_session_v1";

export const loadSession = async (): Promise<AppSession | null> => {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AppSession;
    if (!parsed.token || !parsed.baseUrl) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveSession = async (session: AppSession): Promise<void> => {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const clearSession = async (): Promise<void> => {
  await AsyncStorage.removeItem(SESSION_KEY);
};
