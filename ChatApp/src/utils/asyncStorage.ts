import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  REFRESH_TOKEN: 'refresh_token',
  LAST_SYNC_AT: 'last_sync_at',
  OFFLINE_QUEUE: 'offline_queue',
  USER: 'user',
  FCM_TOKEN: 'fcm_token',
} as const;

export const storage = {
  async getRefreshToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
  },
  async setRefreshToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, token);
  },
  async clearRefreshToken(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.REFRESH_TOKEN);
  },
  async getLastSyncAt(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.LAST_SYNC_AT);
  },
  async setLastSyncAt(ts: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.LAST_SYNC_AT, ts);
  },
  async getOfflineQueue(): Promise<any[]> {
    const data = await AsyncStorage.getItem(KEYS.OFFLINE_QUEUE);
    return data ? JSON.parse(data) : [];
  },
  async setOfflineQueue(queue: any[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  },
  async getUser(): Promise<any | null> {
    const data = await AsyncStorage.getItem(KEYS.USER);
    return data ? JSON.parse(data) : null;
  },
  async setUser(user: any): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
  },
  async clearUser(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.USER);
  },
  async getFcmToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.FCM_TOKEN);
  },
  async setFcmToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.FCM_TOKEN, token);
  },
  async clearFcmToken(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.FCM_TOKEN);
  },
};

export { KEYS };
