import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import { authApi } from '../services/api/apiService';
import { storage } from '../utils/asyncStorage';
import { setTokens, clearTokens } from '../utils/apiClient';
import { socketService } from '../services/socket/SocketService';
import { notificationService } from '../services/NotificationService';
import { offlineQueueService } from '../services/OfflineQueueService';
import { messagesApi } from '../services/api/apiService';
import type { Message } from '../types';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const wasOfflineRef = useRef(false);
  const lastSyncAtRef = useRef<string | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const syncAndFlush = useCallback(async () => {
    // 1. Sync missed messages from server
    const since = lastSyncAtRef.current ?? new Date(0).toISOString();
    const allMessages: Message[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    try {
      while (hasMore) {
        const res = await messagesApi.sync(since, cursor);
        const data = res.data as { items: Message[]; hasMore: boolean; nextCursor: string | null };
        allMessages.push(...(data.items ?? []));
        hasMore = data.hasMore ?? false;
        cursor = data.nextCursor ?? undefined;
      }
      const newSyncAt = new Date().toISOString();
      lastSyncAtRef.current = newSyncAt;
      await storage.setLastSyncAt(newSyncAt);
    } catch {
      // Sync failure is non-fatal — queue still processes
    }

    // 2. Flush offline queue (pending messages sent while offline)
    await offlineQueueService.processQueue();
  }, []);

  // ── Auto-login on app start ─────────────────────────────────────────────────

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const refreshToken = await storage.getRefreshToken();
        if (refreshToken) {
          const res = await authApi.refresh(refreshToken);
          const { accessToken, refreshToken: newRefresh } = res.data;
          setTokens(accessToken, newRefresh);
          await storage.setRefreshToken(newRefresh);
          const me = await authApi.getMe();
          setUser(me.data);
        }
      } catch {
        clearTokens();
        await storage.clearRefreshToken();
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  // ── Network connectivity monitoring ─────────────────────────────────────────

  useEffect(() => {
    const handleConnectivityChange = async (isConnected: boolean) => {
      if (!user) return;

      if (isConnected) {
        if (wasOfflineRef.current) {
          // Was offline → now online: sync + flush queue
          await syncAndFlush();
        }
        wasOfflineRef.current = false;
        socketService.connect();
      } else {
        wasOfflineRef.current = true;
        socketService.disconnect();
      }
    };

    let prevConnected = false;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected === true;
      if (isConnected !== prevConnected) {
        prevConnected = isConnected;
        handleConnectivityChange(isConnected);
      }
    });

    return unsubscribe;
  }, [user, syncAndFlush]);

  // ── On auth success: connect socket + sync + flush queue + register push ────

  useEffect(() => {
    if (!user) return;
    (async () => {
      socketService.connect();
      lastSyncAtRef.current = await storage.getLastSyncAt();
      await syncAndFlush();
      // Register for push notifications (non-blocking)
      notificationService.registerToken().catch(() => {});
    })();

    const unsubTokenRefresh = notificationService.onTokenRefresh();
    return () => unsubTokenRefresh();
  }, [user, syncAndFlush]);

  // ── Login / Register / Logout ────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    const { accessToken, refreshToken } = res.data;
    setTokens(accessToken, refreshToken);
    await storage.setRefreshToken(refreshToken);
    const me = await authApi.getMe();
    setUser(me.data);
    // Socket + sync handled by the user effect above
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await authApi.register({ email, password, displayName });
    const { accessToken, refreshToken } = res.data;
    setTokens(accessToken, refreshToken);
    await storage.setRefreshToken(refreshToken);
    const me = await authApi.getMe();
    setUser(me.data);
    // Socket + sync handled by the user effect above
  }, []);

  const logout = useCallback(async () => {
    try {
      await notificationService.unregisterToken();
    } catch {
      // Best-effort
    }
    try {
      const refreshToken = await storage.getRefreshToken();
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch {
      // ignore
    }
    socketService.disconnect();
    clearTokens();
    await storage.clearRefreshToken();
    await storage.clearUser();
    setUser(null);
    lastSyncAtRef.current = null;
    wasOfflineRef.current = false;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
