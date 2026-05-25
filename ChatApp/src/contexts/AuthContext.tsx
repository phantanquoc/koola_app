import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { authApi, usersApi, setAccessTokenInMemory, getAccessTokenInMemory, setForceLogoutHandler } from '../services/api/apiService';
import { asyncStorage } from '../services/storage/asyncStorage';
import { socketService } from '../services/socket/SocketService';
import { pushNotificationService } from '../services/push/pushNotificationService';
import { webrtcService } from '../services/webrtc/WebRTCService';
import * as messageCache from '../services/messageCacheService';
import { initDb, wipeAllData, shutdownDb } from '../services/db/dbInit';
import { wireSocketEvents } from '../services/sync/socketEventRouter';
import { wireSyncTriggers } from '../services/sync/syncOrchestrator';
import { wireMediaPreloader, isDataSaverEnabled, setDataSaver } from '../services/media/mediaPreloader';
import { isLocalFirstEnabled } from '../config/featureFlags';
import type { User } from '../types';

// ─── Local-first wiring teardown refs ─────────────────────────────────────────
// Stored at module level so logout can call them regardless of React lifecycle.
let _unwireSocketEvents: (() => void) | null = null;
let _unwireSyncTriggers: (() => void) | null = null;
let _unwireMediaPreloader: (() => void) | null = null;

/**
 * Wire all local-first services after DB init.
 * Idempotent — each wire function guards against double-registration internally.
 */
function wireLocalFirst(): void {
  if (!isLocalFirstEnabled()) return;
  _unwireSocketEvents = wireSocketEvents();
  _unwireSyncTriggers = wireSyncTriggers();
  _unwireMediaPreloader = wireMediaPreloader();
  // Restore persisted data-saver preference so the preloader honours it
  // from the very first event after login.
  setDataSaver(isDataSaverEnabled());
}

/**
 * Tear down all local-first services before DB wipe on logout.
 */
function unwireLocalFirst(): void {
  _unwireSocketEvents?.();
  _unwireSocketEvents = null;
  _unwireSyncTriggers?.();
  _unwireSyncTriggers = null;
  _unwireMediaPreloader?.();
  _unwireMediaPreloader = null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  registerInit: (body: {
    phone: string;
    email: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const appStateRef = useRef(AppState.currentState);

  const isAuthenticated = !!user;

  // ─── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    restoreSession();
  }, []);

  // ─── Force-logout wiring ──────────────────────────────────────────────────
  // apiService's 401 interceptor invokes this when refresh fails. We have to
  // tear down user state + sockets here, otherwise the UI sits in a broken
  // logged-in state with no token.
  useEffect(() => {
    setForceLogoutHandler(() => {
      setAccessTokenInMemory(null);
      try {
        socketService.disconnect();
      } catch {
        // ignore
      }
      try {
        webrtcService.disconnect();
      } catch {
        // ignore
      }
      setUser(null);
    });
    return () => setForceLogoutHandler(null);
  }, []);

  // ─── AppState listener — reconnect socket on foreground ────────────────────
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [user]);

  const handleAppStateChange = useCallback(
    (nextState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active' &&
        user
      ) {
        // Reconnect socket when app comes to foreground
        const reconnect = async () => {
          const token = getAccessTokenInMemory();
          if (token && !socketService.isConnected()) {
            socketService.connect(token);
          }
        };
        reconnect();
      }
      appStateRef.current = nextState;
    },
    [user],
  );

  const restoreSession = async () => {
    try {
      const refreshToken = await asyncStorage.getRefreshToken();
      if (!refreshToken) {
        setIsLoading(false);
        return;
      }

      const tokens = await authApi.refresh(refreshToken);
      setAccessTokenInMemory(tokens.accessToken);
      await asyncStorage.setRefreshToken(tokens.refreshToken);

      const me = await usersApi.getMe();
      setUser(me);

      // Initialise local SQLite DB for this user (additive — no-op if already open)
      await initDb(me._id).catch((e) =>
        console.warn('[AuthContext] restoreSession: initDb failed', e),
      );

      // Wire local-first services (socket router, sync triggers, media preloader)
      wireLocalFirst();

      // Connect socket + webrtc
      socketService.connect(tokens.accessToken);
      webrtcService.connect(tokens.accessToken);

      // Register push notifications
      pushNotificationService.registerToken().catch(() => {});
    } catch {
      // Session restore failed — clear tokens
      await asyncStorage.clearTokens();
      setAccessTokenInMemory(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    setAccessTokenInMemory(data.accessToken);
    await asyncStorage.setRefreshToken(data.refreshToken);

    const me = await usersApi.getMe();
    setUser(me);

    // Initialise local SQLite DB for this user
    await initDb(me._id).catch((e) =>
      console.warn('[AuthContext] login: initDb failed', e),
    );

    // Wire local-first services (socket router, sync triggers, media preloader)
    wireLocalFirst();

    // Connect socket + webrtc
    socketService.connect(data.accessToken);
    webrtcService.connect(data.accessToken);

    // Register push notifications
    pushNotificationService.registerToken().catch(() => {});
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const data = await authApi.register(email, password, displayName);
      setAccessTokenInMemory(data.accessToken);
      await asyncStorage.setRefreshToken(data.refreshToken);

      const me = await usersApi.getMe();
      setUser(me);

      // Initialise local SQLite DB for this user
      await initDb(me._id).catch((e) =>
        console.warn('[AuthContext] register: initDb failed', e),
      );

      // Wire local-first services (socket router, sync triggers, media preloader)
      wireLocalFirst();

      // Connect socket + webrtc
      socketService.connect(data.accessToken);
      webrtcService.connect(data.accessToken);

      // Register push notifications
      pushNotificationService.registerToken().catch(() => {});
    },
    [],
  );

  const registerInit = useCallback(
    async (body: {
      phone: string;
      email: string;
      password: string;
      displayName: string;
    }) => {
      await authApi.registerInit(body);
    },
    [],
  );

  const verifyOtp = useCallback(async (email: string, otp: string) => {
    const data = await authApi.verifyOtp(email, otp);
    setAccessTokenInMemory(data.accessToken);
    await asyncStorage.setRefreshToken(data.refreshToken);

    const me = await usersApi.getMe();
    setUser(me);

    // Initialise local SQLite DB for this user
    await initDb(me._id).catch((e) =>
      console.warn('[AuthContext] verifyOtp: initDb failed', e),
    );

    // Wire local-first services (socket router, sync triggers, media preloader)
    wireLocalFirst();

    socketService.connect(data.accessToken);
    webrtcService.connect(data.accessToken);
    pushNotificationService.registerToken().catch(() => {});
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await usersApi.getMe();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    try {
      await pushNotificationService.unregisterToken();
      webrtcService.disconnect();
      socketService.disconnect();
      const refreshToken = await asyncStorage.getRefreshToken();
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch {
      // Ignore logout errors
    } finally {
      setAccessTokenInMemory(null);
      await asyncStorage.clearAll();
      messageCache.clearAll();
      // Tear down local-first services before wiping the DB
      unwireLocalFirst();
      // Wipe SQLite data and close connection (additive alongside MMKV clearAll)
      await wipeAllData().catch((e) =>
        console.warn('[AuthContext] logout: wipeAllData failed', e),
      );
      shutdownDb();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        login,
        register,
        registerInit,
        verifyOtp,
        refreshUser,
        logout,
      }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
