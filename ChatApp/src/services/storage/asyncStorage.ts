import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
  OFFLINE_QUEUE: 'offline_queue',
  LAST_SYNC_AT: 'last_sync_at',
};

export const asyncStorage = {
  // ─── Auth tokens ───────────────────────────────────────────────────────────
  async getAccessToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
  },
  async setAccessToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, token);
  },
  async getRefreshToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
  },
  async setRefreshToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, token);
  },
  async clearTokens(): Promise<void> {
    await AsyncStorage.multiRemove([KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN]);
  },

  // ─── User ──────────────────────────────────────────────────────────────────
  async getUser(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.USER);
  },
  async setUser(user: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER, user);
  },
  async clearUser(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.USER);
  },

  // ─── Offline Queue ────────────────────────────────────────────────────────
  async getOfflineQueue(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.OFFLINE_QUEUE);
  },
  async setOfflineQueue(queue: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, queue);
  },
  async clearOfflineQueue(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.OFFLINE_QUEUE);
  },

  // ─── Sync ──────────────────────────────────────────────────────────────────
  async getLastSyncAt(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.LAST_SYNC_AT);
  },
  async setLastSyncAt(timestamp: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.LAST_SYNC_AT, timestamp);
  },

  // ─── Clear all ────────────────────────────────────────────────────────────
  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};

export default asyncStorage;
