import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { AppState, AppStateStatus, Alert } from 'react-native';
import { authApi, usersApi, accountsApi, setAccessTokenInMemory, getAccessTokenInMemory, setForceLogoutHandler } from '../services/api/apiService';
import { asyncStorage } from '../services/storage/asyncStorage';
import { socketService } from '../services/socket/SocketService';
import { pushNotificationService } from '../services/push/pushNotificationService';
import { webrtcService } from '../services/webrtc/WebRTCService';
import * as messageCache from '../services/messageCacheService';
import { initDb, wipeAllData, shutdownDb } from '../services/db/dbInit';
import { wireSocketEvents, setCurrentUserId } from '../services/sync/socketEventRouter';
import { wireSyncTriggers } from '../services/sync/syncOrchestrator';
import { wireMediaPreloader, isDataSaverEnabled, setDataSaver } from '../services/media/mediaPreloader';
import { isLocalFirstEnabled } from '../config/featureFlags';
import { pause as pauseOutboxProcessor, start as startOutboxProcessor, stop as stopOutboxProcessor } from '../services/sync/outboxProcessor';
import { navigationRef } from '../navigation/RootNavigator';
import { momentsService } from '../services/moments/momentsService';
import { clearAccountBadge } from '../services/push/accountBadgeStorage';
import type { User, Account } from '../types';

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
  // Phase 4: start outbox processor (registers NetInfo + AppState triggers)
  startOutboxProcessor();
}

/**
 * Tear down all local-first services before DB wipe on logout.
 * Phase 4.6: pause outbox processor BEFORE wipeAllData (Decision 13).
 */
function unwireLocalFirst(): void {
  // Pause outbox processor first — prevents in-flight tick from writing
  // to the DB after wipeAllData clears it (Decision 13: instant wipe, no flush).
  if (isLocalFirstEnabled()) {
    pauseOutboxProcessor();
  }
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
  /** All accounts (root + owned businesses) for the signed-in user */
  accounts: Account[];
  /** The currently active account (may be a business account) */
  activeAccount: Account | null;
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
  /** Switch to any owned account (personal or business). Guards against active calls. */
  switchAccount: (targetId: string) => Promise<void>;
  /** Convenience: switch back to the root personal account */
  switchBackToPersonal: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
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
      // Mirror logout() teardown ordering to prevent listener leaks on re-login.
      // setCurrentUserId(null) resets socketEventRouter's _currentUserId so the
      // next login's wireSyncTriggers idempotent guard sees a clean state.
      // unwireLocalFirst() releases AppState + socket subscriptions from this session.
      // wipeAllData is fire-and-forget — force-logout is already a side-effect path;
      // the cross-account guard in dbInit catches the worst case if the wipe races.
      setCurrentUserId(null);
      momentsService.setCurrentUserId(null);
      unwireLocalFirst();
      wipeAllData().catch((e) =>
        console.warn('[AuthContext] force-logout: wipeAllData failed', e),
      );
      shutdownDb();
      setUser(null);
      setAccounts([]);
      setActiveAccount(null);
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
        // Refresh Moments feed so new stories appear without manual pull-to-refresh
        momentsService.refreshFeed().catch(() => {});
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

      // Step 1: Refresh root token
      const tokens = await authApi.refresh(refreshToken);
      let workingAccessToken = tokens.accessToken;
      setAccessTokenInMemory(tokens.accessToken);
      await asyncStorage.setRefreshToken(tokens.refreshToken);

      const me = await usersApi.getMe();
      setUser(me);

      // Step 2: Load account list
      let loadedAccounts: Account[] = [];
      try {
        loadedAccounts = await accountsApi.list();
        setAccounts(loadedAccounts);
      } catch {
        // Non-fatal — degrade gracefully
      }

      // Step 3: If last active account was a business, re-switch into it
      const storedActiveAccountId = await asyncStorage.getActiveAccountId();
      let activeId = me._id;
      if (storedActiveAccountId && storedActiveAccountId !== me._id) {
        try {
          const { accessToken: bizToken } = await accountsApi.switch(storedActiveAccountId);
          workingAccessToken = bizToken;
          setAccessTokenInMemory(bizToken);
          activeId = storedActiveAccountId;
        } catch {
          // Switch failed — fall back to personal
          await asyncStorage.clearActiveAccountId();
          activeId = me._id;
        }
      }

      const resolvedActive = loadedAccounts.find((a) => a._id === activeId) ?? {
        _id: me._id,
        displayName: me.displayName,
        avatar: me.avatar,
        accountType: 'personal' as const,
      };
      setActiveAccount(resolvedActive);

      setCurrentUserId(activeId);
      momentsService.setCurrentUserId(activeId);

      // Initialise local SQLite DB (additive — no-op if already open)
      await initDb(activeId).catch((e) =>
        console.warn('[AuthContext] restoreSession: initDb failed', e),
      );

      // Wire local-first services
      wireLocalFirst();

      // Connect socket + webrtc with the working token
      socketService.connect(workingAccessToken);
      webrtcService.connect(workingAccessToken);

      // Register push notifications
      pushNotificationService.registerToken().catch(() => {});
    } catch {
      // Session restore failed — clear tokens
      await asyncStorage.clearTokens();
      await asyncStorage.clearActiveAccountId();
      setAccessTokenInMemory(null);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Switch account (D5) ──────────────────────────────────────────────────

  const switchAccount = useCallback(async (targetId: string) => {
    // (a) Guard: block switch during active/ringing call
    const callState = webrtcService.getCallState();
    if (callState !== 'idle' && callState !== 'ended' && callState !== 'failed') {
      Alert.alert('Không thể chuyển tài khoản', 'Hãy kết thúc cuộc gọi trước');
      return;
    }

    // (b) Get delegated token from server
    const { accessToken: newToken } = await accountsApi.switch(targetId);

    // (c) Tear down current account
    unwireLocalFirst();
    setCurrentUserId(null);
    momentsService.setCurrentUserId(null);
    socketService.disconnect();
    webrtcService.disconnect();
    shutdownDb();
    // NOTE: do NOT clear the root refresh token here

    // (d) Set new access token in-memory and persist active account
    setAccessTokenInMemory(newToken);
    await asyncStorage.setActiveAccountId(targetId);

    // (e) Re-init under the new account
    setCurrentUserId(targetId);
    momentsService.setCurrentUserId(targetId);
    await initDb(targetId).catch((e) =>
      console.warn('[AuthContext] switchAccount: initDb failed', e),
    );
    wireLocalFirst();
    socketService.connect(newToken);
    webrtcService.connect(newToken);
    // Re-register FCM context (token stays on root, but we want listeners active)
    pushNotificationService.registerToken().catch(() => {});

    // (f) Update active account in state
    const found = accounts.find((a) => a._id === targetId);
    setActiveAccount(found ?? { _id: targetId, displayName: targetId, accountType: 'personal' });
    // (g) Clear per-account notification badge now that this account is active
    void clearAccountBadge(targetId);
  }, [accounts]);

  const switchBackToPersonal = useCallback(async () => {
    if (!user) return;
    await switchAccount(user._id);
  }, [user, switchAccount]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    setAccessTokenInMemory(data.accessToken);
    await asyncStorage.setRefreshToken(data.refreshToken);

    const me = await usersApi.getMe();
    setUser(me);
    setCurrentUserId(me._id);
    momentsService.setCurrentUserId(me._id);

    // Load accounts
    try {
      const loadedAccounts = await accountsApi.list();
      setAccounts(loadedAccounts);
    } catch {
      // Non-fatal
    }

    const personalAccount: Account = {
      _id: me._id,
      displayName: me.displayName,
      avatar: me.avatar,
      accountType: 'personal',
    };
    setActiveAccount(personalAccount);
    await asyncStorage.clearActiveAccountId();

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
      setCurrentUserId(me._id);
      momentsService.setCurrentUserId(me._id);

      const personalAccount: Account = {
        _id: me._id,
        displayName: me.displayName,
        avatar: me.avatar,
        accountType: 'personal',
      };
      setAccounts([personalAccount]);
      setActiveAccount(personalAccount);
      await asyncStorage.clearActiveAccountId();

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
    setCurrentUserId(me._id);

    const personalAccount: Account = {
      _id: me._id,
      displayName: me.displayName,
      avatar: me.avatar,
      accountType: 'personal',
    };
    setAccounts([personalAccount]);
    setActiveAccount(personalAccount);
    await asyncStorage.clearActiveAccountId();

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
    // ─── Phase 1: Navigate to LogoutTransition (keep container mounted) ────────
    // Directly flipping `user` to null unmounts the ENTIRE authenticated tree
    // (Main + 3 modals + ChatTabStack with 6 screens) in ONE Fabric commit while
    // react-native-screens' native RNSScreenStack is still tearing down the same
    // ViewGroup — resulting in "Cannot remove child at index N … childCount may
    // be incorrect" on RN 0.76 + Fabric. Five prior approaches (isLoading splash,
    // 2-rAF delay, freezeOnBlur, DIAG_STATIC_TABDOCK, Toast-at-root) reduced
    // scope but did not eliminate the root race.
    //
    // This fix keeps NavigationContainer mounted for the entire logout sequence.
    // navigationRef.reset() navigates INSIDE the authenticated group to the
    // LogoutTransition screen (= SplashScreen). react-native-screens handles the
    // reset natively (pops any open modals, replaces Main on the RNSScreenStack)
    // so Fabric only processes a small diff, never a full subtree remove. After
    // 3 rAF frames the native settle is complete; we run teardown and THEN flip
    // setUser(null) — at that point only LogoutTransition needs to unmount (1
    // screen, tiny Fabric batch) → no removeViewAt race.
    // See [[logout_removeviewat_crash]].
    if (navigationRef.isReady()) {
      navigationRef.reset({ index: 0, routes: [{ name: 'LogoutTransition' }] });
    }

    // ─── Phase 2: Await 3 rAF ticks for Fabric + RNS to settle ───────────────
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      ),
    );

    // ─── Phase 3: Teardown + auth group flip ──────────────────────────────────
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
      // Clear current user id before tearing down local-first services
      setCurrentUserId(null);
      momentsService.setCurrentUserId(null);
      // Tear down local-first services before wiping the DB
      unwireLocalFirst();
      // Reset moments service state on logout
      momentsService.reset();
      // Wipe SQLite data and close connection (additive alongside MMKV clearAll)
      await wipeAllData().catch((e) =>
        console.warn('[AuthContext] logout: wipeAllData failed', e),
      );
      shutdownDb();
      setAccounts([]);
      setActiveAccount(null);
      // setUser(null) flips the auth group — only LogoutTransition is on the
      // stack at this point (1 screen), so Fabric's unmount batch is tiny and
      // the RNSScreenStack is already idle → no removeViewAt race.
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        accounts,
        activeAccount,
        login,
        register,
        registerInit,
        verifyOtp,
        refreshUser,
        logout,
        switchAccount,
        switchBackToPersonal,
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
