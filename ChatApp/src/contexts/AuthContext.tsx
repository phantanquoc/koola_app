import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { AppState, AppStateStatus, Alert } from 'react-native';
import { authApi, usersApi, accountsApi, conversationsApi, setAccessTokenInMemory, getAccessTokenInMemory, setForceLogoutHandler, setSessionEndedHandler } from '../services/api/apiService';
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
import { scheduleMaintenance, _resetForTesting as resetMaintenance } from '../services/db/storageMaintenance';
import { navigationRef } from '../navigation/RootNavigator';
import { momentsService } from '../services/moments/momentsService';
import { clearAccountBadge } from '../services/push/accountBadgeStorage';
import * as conversationRepository from '../services/db/conversationRepository';
import { cartStore } from '../services/shopping/cartStore';
import { BUSINESS_ROLE_LEVEL } from '../types';
import type { User, Account, BusinessRole } from '../types';

// ─── Local-first wiring teardown refs ─────────────────────────────────────────
// Stored at module level so logout can call them regardless of React lifecycle.
let _unwireSocketEvents: (() => void) | null = null;
let _unwireSyncTriggers: (() => void) | null = null;
let _unwireMediaPreloader: (() => void) | null = null;

/**
 * Parse role from JWT access token (if present).
 * Business member tokens include a "role" claim; personal tokens do not.
 * Returns undefined if token is invalid or role claim is missing.
 */
function parseRoleFromToken(token: string | null): BusinessRole | undefined {
  if (!token) return undefined;

  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;

    // Convert base64url → base64, then restore the padding JWT strips.
    // atob rejects unpadded input, so a payload whose length isn't a multiple
    // of 4 would otherwise throw and silently drop the role claim.
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded));

    const role = decoded.role;
    if (role === 'owner' || role === 'admin' || role === 'editor' || role === 'viewer') {
      return role;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

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
  // Schedule an idle maintenance pass (prune + reap + bounded vacuum).
  // Idempotent within a session; debounced so rapid foreground toggles
  // don't queue multiple passes. Runs via InteractionManager, never blocks
  // first paint.
  scheduleMaintenance();
}

/**
 * Seed conversations into SQLite on login/restore/switch.
 * Ensures bumpFromMessage() always finds a row to UPDATE when new_message
 * socket events arrive, preventing silent real-time failures where
 * rowsAffected = 0 → notify() never called → UI never updates.
 *
 * Fire-and-forget: does not block the auth flow. Failures are logged but
 * non-fatal — user can still pull-to-refresh to seed manually.
 */
function seedConversationsIntoSQLite(): void {
  if (!isLocalFirstEnabled()) return;

  conversationsApi.list(1, 50)
    .then(data => {
      const inputs = data.conversations.map(c => ({
        id: c._id,
        type: c.type,
        name: c.name ?? null,
        avatarKey: c.avatar ?? null,
        members: c.members,
        lastMessageId: null,
        lastMessagePreview: c.lastMessagePreview ?? null,
        lastMessageAt: c.lastMessageAt ?? 0,
        unreadCount: c.unreadCount ?? 0,
        pinned: c.pinned ?? false,
        archived: false,
        mutedUntil: c.mutedUntil ?? null,
        clearedAt: c.clearedAt ?? null,
        updatedAt: c.updatedAt,
      }));
      conversationRepository.upsertMany(inputs);
      console.log('[AuthContext] Seeded', inputs.length, 'conversations into SQLite');
    })
    .catch(err => {
      console.warn('[AuthContext] Conversation seed failed (non-fatal):', err);
    });
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
  // Allow the next login to schedule a fresh maintenance pass.
  resetMaintenance();
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** All accounts (root + owned businesses + member businesses) for the signed-in user */
  accounts: Account[];
  /** The currently active account (may be a business account) */
  activeAccount: Account | null;
  /** Role in the active business account (owner/admin/editor/viewer). Undefined for personal accounts. */
  currentRole?: BusinessRole;
  /** True while switchAccount is tearing down + re-initialising the new account */
  isSwitchingAccount: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerInit: (body: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<{ message: string }>;
  verifyResetOtp: (email: string, otp: string) => Promise<{ resetToken: string }>;
  resetPassword: (resetToken: string, newPassword: string) => Promise<{ message: string }>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  /** Switch to any owned account (personal or business). Guards against active calls. */
  switchAccount: (targetId: string) => Promise<void>;
  /** Convenience: switch back to the root personal account */
  switchBackToPersonal: () => Promise<void>;
  /**
   * Refetch the account list (owned + member businesses). Call after a
   * membership change — accepting an invite, being removed — since `accounts`
   * is otherwise only loaded on login/restore.
   */
  refreshAccounts: () => Promise<Account[]>;
  /** Check if current user has at least the required role in active business account. Returns true for personal accounts. */
  hasRole: (requiredRole: BusinessRole) => boolean;
  /**
   * Set when this device's BUSINESS session was revoked (another device logged
   * in, or an admin forced it out). The app has already fallen back to the
   * personal account; the UI shows this once, then calls
   * `clearSessionEndedNotice`.
   */
  sessionEndedNotice: string | null;
  clearSessionEndedNotice: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [currentRole, setCurrentRole] = useState<BusinessRole | undefined>(undefined);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  /**
   * Set when the backend revoked this device's business session (task 17.1).
   * Surfaced by the UI once, then cleared via `clearSessionEndedNotice()`.
   */
  const [sessionEndedNotice, setSessionEndedNotice] = useState<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  /**
   * Lets the session-ended effect call switchAccount without re-subscribing
   * every time that callback's identity changes (it depends on `accounts`).
   */
  const switchAccountRef = useRef<((targetId: string) => Promise<void>) | null>(null);

  // The ROOT human's user id. `user._id` tracks the ACTIVE identity (it changes
  // to the business id on switch so chat bubbles / "other member" detection are
  // correct), so we keep the durable root id here for switchBackToPersonal and
  // ownership-derived flows. Seeded on login/restore, never on a business switch.
  const rootUserIdRef = useRef<string | null>(null);

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
      // Drop every account's shopping cart from the device (mirrors logout).
      cartStore.clearAllAccounts();
      rootUserIdRef.current = null;
    });
    return () => setForceLogoutHandler(null);
  }, []);

  // ─── Business session ended (business-members task 17.1) ──────────────────
  // The BUSINESS context was revoked (another device took over, or an admin
  // forced this one out) while the personal session is still perfectly valid.
  // So this is NOT a logout: drop back to the root personal account and tell
  // the user why. A full teardown here would be wrong — and retrying the
  // refresh would re-claim the session and evict the device that just won it.
  useEffect(() => {
    setSessionEndedHandler((message) => {
      setSessionEndedNotice(message);
      const rootId = rootUserIdRef.current;
      if (!rootId) return;
      void switchAccountRef.current?.(rootId).catch((e) =>
        console.warn('[AuthContext] session-ended fallback failed', e),
      );
    });
    return () => setSessionEndedHandler(null);
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
          if (token && !webrtcService.isConnected()) {
            webrtcService.connect(token);
            // Give the new socket a moment to handshake before sync
            setTimeout(() => { try { webrtcService.emitSync(); } catch {} }, 800);
          } else if (token) {
            // Already connected but may have missed incoming_call while backgrounded
            try { webrtcService.emitSync(); } catch {}
          }
        };
        reconnect();
        // Refresh Moments feed so new stories appear without manual pull-to-refresh
        momentsService.refreshFeed().catch(() => {});
        // Kick off idle maintenance when returning to foreground. Idempotent
        // within a session; debounced and InteractionManager-gated so it won't
        // jank the transition animation.
        scheduleMaintenance();
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
      // `me` here is the ROOT (token was just refreshed, before any switch).
      rootUserIdRef.current = me._id;

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

          // Parse role from business token
          const role = parseRoleFromToken(bizToken);
          setCurrentRole(role);

          // Adopt the business identity so `user._id` reflects the active
          // account after a cold start into a business account (parity with
          // switchAccount's getMe step).
          try {
            const bizMe = await usersApi.getMe();
            setUser(bizMe);
          } catch (e) {
            console.warn('[AuthContext] restoreSession: business getMe failed', e);
          }
        } catch {
          // Switch failed — fall back to personal
          await asyncStorage.clearActiveAccountId();
          activeId = me._id;
          setCurrentRole(undefined);
        }
      } else {
        // Personal account — no role
        setCurrentRole(undefined);
      }

      // Fallback covers "account list failed to load". If we restored into a
      // business (activeId moved off the root id), label it as such instead of
      // falling back to the root personal identity, which would hide
      // business-only UI until the next successful /accounts fetch.
      const resolvedActive: Account =
        loadedAccounts.find((a) => a._id === activeId) ??
        (activeId === me._id
          ? {
              _id: me._id,
              displayName: me.displayName,
              avatar: me.avatar,
              accountType: 'personal',
            }
          : {
              _id: activeId,
              displayName: activeId,
              accountType: 'business',
              role: parseRoleFromToken(workingAccessToken),
            });
      setActiveAccount(resolvedActive);
      // Shopping cart is per active account (commerce-catalog D11).
      cartStore.setAccount(activeId);

      setCurrentUserId(activeId);
      momentsService.setCurrentUserId(activeId);

      // Initialise local SQLite DB (additive — no-op if already open)
      await initDb(activeId).catch((e) =>
        console.warn('[AuthContext] restoreSession: initDb failed', e),
      );

      // Wire local-first services
      wireLocalFirst();

      // Seed conversations so socket bumps have rows to update
      seedConversationsIntoSQLite();

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

    setIsSwitchingAccount(true);
    try {
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

      // Parse role from JWT (business member tokens include role claim)
      const role = parseRoleFromToken(newToken);
      setCurrentRole(role);

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

      // Seed conversations after account switch
      seedConversationsIntoSQLite();

      // (f) Adopt the target's identity so every `user._id` consumer (chat
      // bubble left/right, conversation "other member" detection, the profile
      // screen) reflects the account the user is now acting as — not the root.
      try {
        const me = await usersApi.getMe();
        setUser(me);
      } catch (e) {
        console.warn('[AuthContext] switchAccount: getMe failed', e);
      }

      // (g) Update active account in state. `accounts` holds owned AND member
      // businesses (GET /accounts returns both), so a member business resolves
      // here like an owned one. The fallback only fires when the account list
      // failed to load: a role claim in the token means we switched into a
      // business, so don't mislabel it as personal — `accountType` drives
      // business-only UI (e.g. the Shopping orders entry).
      const found = accounts.find((a) => a._id === targetId);
      setActiveAccount(
        found ?? {
          _id: targetId,
          displayName: targetId,
          accountType: role ? 'business' : 'personal',
          role,
        },
      );
      // Swap to the target account's shopping cart (commerce-catalog D11).
      cartStore.setAccount(targetId);
      // (h) Clear per-account notification badge now that this account is active
      void clearAccountBadge(targetId);
    } finally {
      setIsSwitchingAccount(false);
    }
  }, [accounts]);

  // Keep the ref pointed at the live callback for the session-ended effect.
  switchAccountRef.current = switchAccount;

  const switchBackToPersonal = useCallback(async () => {
    const rootId = rootUserIdRef.current ?? user?._id;
    if (!rootId) return;
    await switchAccount(rootId);
  }, [user, switchAccount]);

  const clearSessionEndedNotice = useCallback(() => {
    setSessionEndedNotice(null);
  }, []);

  /**
   * Refetch `GET /accounts` into state.
   *
   * Needed whenever membership changes outside the switcher — accepting an
   * invite adds a business, being removed takes one away — because `accounts`
   * is otherwise only loaded on login/restore. `switchAccount` resolves its
   * target from this list, so callers that then switch must refresh first.
   *
   * Returns the list so a caller can act on it without waiting for a re-render.
   */
  const refreshAccounts = useCallback(async (): Promise<Account[]> => {
    try {
      const loaded = await accountsApi.list();
      setAccounts(loaded);
      return loaded;
    } catch (e) {
      console.warn('[AuthContext] refreshAccounts failed', e);
      return [];
    }
  }, []);

  /**
   * Check if current user has at least the required role in active business account.
   * Role hierarchy: owner > admin > editor > viewer
   * Returns true for personal accounts (no restrictions).
   */
  const hasRole = useCallback((requiredRole: BusinessRole): boolean => {
    // No role claim = personal account (or an owned business before the role
    // claim lands) — unrestricted, matching the backend, which defaults a
    // missing JWT role to "owner".
    if (!currentRole) return true;

    return BUSINESS_ROLE_LEVEL[currentRole] >= BUSINESS_ROLE_LEVEL[requiredRole];
  }, [currentRole]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    setAccessTokenInMemory(data.accessToken);
    await asyncStorage.setRefreshToken(data.refreshToken);

    const me = await usersApi.getMe();
    setUser(me);
    rootUserIdRef.current = me._id;
    setCurrentUserId(me._id);
    momentsService.setCurrentUserId(me._id);

    // Login always starts as personal account (no role)
    setCurrentRole(undefined);

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
    cartStore.setAccount(me._id);
    await asyncStorage.clearActiveAccountId();

    // Initialise local SQLite DB for this user
    await initDb(me._id).catch((e) =>
      console.warn('[AuthContext] login: initDb failed', e),
    );

    // Wire local-first services (socket router, sync triggers, media preloader)
    wireLocalFirst();

    // Seed conversations so socket bumps have rows to update
    seedConversationsIntoSQLite();

    // Connect socket + webrtc
    socketService.connect(data.accessToken);
    webrtcService.connect(data.accessToken);

    // Register push notifications
    pushNotificationService.registerToken().catch(() => {});
  }, []);

  const registerInit = useCallback(
    async (body: {
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
    rootUserIdRef.current = me._id;
    setCurrentUserId(me._id);

    const personalAccount: Account = {
      _id: me._id,
      displayName: me.displayName,
      avatar: me.avatar,
      accountType: 'personal',
    };
    setAccounts([personalAccount]);
    setActiveAccount(personalAccount);
    cartStore.setAccount(me._id);
    await asyncStorage.clearActiveAccountId();

    // Initialise local SQLite DB for this user
    await initDb(me._id).catch((e) =>
      console.warn('[AuthContext] verifyOtp: initDb failed', e),
    );

    // Wire local-first services (socket router, sync triggers, media preloader)
    wireLocalFirst();

    // Seed conversations so socket bumps have rows to update. A brand-new
    // account normally has none, but this keeps the invariant unconditional:
    // every path that wires the socket router also seeds.
    seedConversationsIntoSQLite();

    socketService.connect(data.accessToken);
    webrtcService.connect(data.accessToken);
    pushNotificationService.registerToken().catch(() => {});
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    return authApi.forgotPassword(email);
  }, []);

  const verifyResetOtp = useCallback(async (email: string, otp: string) => {
    return authApi.verifyResetOtp(email, otp);
  }, []);

  const resetPassword = useCallback(async (resetToken: string, newPassword: string) => {
    return authApi.resetPassword(resetToken, newPassword);
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
      setCurrentRole(undefined);
      // Wipe the shopping cart storage for every account (commerce-catalog D11).
      cartStore.clearAllAccounts();
      rootUserIdRef.current = null;
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
        currentRole,
        isSwitchingAccount,
        login,
        registerInit,
        verifyOtp,
        forgotPassword,
        verifyResetOtp,
        resetPassword,
        refreshUser,
        logout,
        switchAccount,
        switchBackToPersonal,
        hasRole,
        refreshAccounts,
        sessionEndedNotice,
        clearSessionEndedNotice,
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
