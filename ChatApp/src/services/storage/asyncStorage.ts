import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RecentSearchItem } from '../../types';
import type { ThemeMode } from '../../ui/theme';
import { normalizeMode } from '../../ui/theme';

const KEYS = {
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
  OFFLINE_QUEUE: 'offline_queue',
  LAST_SYNC_AT: 'last_sync_at',
  RECENT_SEARCHES: 'recent_searches',
  ACTIVE_ACCOUNT_ID: 'active_account_id',
  THEME: 'theme',
  AUTO_TRANSLATE: 'auto_translate',
  PREFERRED_LANGUAGE: 'preferred_language',
};

const RECENT_SEARCHES_MAX = 10;

export const asyncStorage = {
  // ─── Auth tokens ───────────────────────────────────────────────────────────
  // NOTE: Access tokens MUST NOT be persisted. They live in memory only
  // (see apiService.setAccessTokenInMemory). Only the refresh token is durable.
  async getRefreshToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
  },
  async setRefreshToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, token);
  },
  async clearTokens(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.REFRESH_TOKEN);
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

  // ─── Active account ────────────────────────────────────────────────────────
  async getActiveAccountId(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.ACTIVE_ACCOUNT_ID);
  },
  async setActiveAccountId(accountId: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.ACTIVE_ACCOUNT_ID, accountId);
  },
  async clearActiveAccountId(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.ACTIVE_ACCOUNT_ID);
  },

  // ─── Recent Searches ──────────────────────────────────────────────────────
  async getRecentSearches(): Promise<RecentSearchItem[]> {
    const raw = await AsyncStorage.getItem(KEYS.RECENT_SEARCHES);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as RecentSearchItem[]) : [];
    } catch {
      return [];
    }
  },
  async addRecentSearch(query: string): Promise<RecentSearchItem[]> {
    const trimmed = query.trim();
    if (!trimmed) return this.getRecentSearches();
    const existing = await this.getRecentSearches();
    const filtered = existing.filter((i) => i.query !== trimmed);
    const next: RecentSearchItem[] = [
      { query: trimmed, searchedAt: new Date().toISOString() },
      ...filtered,
    ].slice(0, RECENT_SEARCHES_MAX);
    await AsyncStorage.setItem(KEYS.RECENT_SEARCHES, JSON.stringify(next));
    return next;
  },
  async removeRecentSearch(query: string): Promise<RecentSearchItem[]> {
    const existing = await this.getRecentSearches();
    const next = existing.filter((i) => i.query !== query);
    await AsyncStorage.setItem(KEYS.RECENT_SEARCHES, JSON.stringify(next));
    return next;
  },
  async clearRecentSearches(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.RECENT_SEARCHES);
  },

  // ─── Theme Mode ──────────────────────────────────────────────────────────
  async getThemeMode(): Promise<ThemeMode> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.THEME);
      return normalizeMode(raw);
    } catch (err) {
      console.warn('[asyncStorage] getThemeMode read failed, falling back to system:', err);
      return 'system';
    }
  },
  async setThemeMode(mode: ThemeMode): Promise<void> {
    await AsyncStorage.setItem(KEYS.THEME, mode);
  },

  // ─── Translation preferences ─────────────────────────────────────────────
  // Optimistic local persistence for the auto-translate toggle and preferred
  // target language. Authoritative values live on PUT /users/me/settings; these
  // keys let the UI reflect the last-known state before the network round-trip
  // completes and survive a device reinstall until the next GET /users/me.
  async getAutoTranslate(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.AUTO_TRANSLATE);
      return raw === 'true';
    } catch {
      return false;
    }
  },
  async setAutoTranslate(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.AUTO_TRANSLATE, enabled ? 'true' : 'false');
  },
  async getPreferredLanguage(): Promise<string> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.PREFERRED_LANGUAGE);
      return raw && /^[a-z]{2}$/.test(raw) ? raw : 'vi';
    } catch {
      return 'vi';
    }
  },
  async setPreferredLanguage(lang: string): Promise<void> {
    const normalized = typeof lang === 'string' ? lang.trim().toLowerCase() : '';
    if (/^[a-z]{2}$/.test(normalized)) {
      await AsyncStorage.setItem(KEYS.PREFERRED_LANGUAGE, normalized);
    }
  },

  // ─── Clear all ────────────────────────────────────────────────────────────
  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};

export default asyncStorage;
