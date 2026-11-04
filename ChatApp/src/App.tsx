import '../global.css';
import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, LogBox, StatusBar, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import Toast from 'react-native-toast-message';
import {
  KoolaConfirmHost,
  koolaConfirm,
  koolaToastConfig,
  ThemeProvider,
  useTheme,
} from './ui';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import RootNavigator, { navigationRef } from './navigation/RootNavigator';
import { offlineQueueService } from './services/OfflineQueueService';
import {
  pushNotificationService,
  consumePendingNotificationTap,
  onPendingNotificationTap,
} from './services/push/pushNotificationService';
import {
  resolveBusinessTap,
  type BusinessTapAction,
} from './services/push/businessTapRoute';
import { getDeviceId } from './services/DeviceIdService';
import { SESSION_ENDED_MESSAGE } from './services/api/apiService';
import { load as loadMediaIndex } from './services/media/mediaIndexService';
import {
  consumePendingIncomingCall,
  registerFcmCallForegroundHandler,
  type IncomingCallNavParams,
} from './services/push/fcmCallHandler';
import { useIncomingCall } from './hooks/useIncomingCall';

// Suppress non-critical RN warnings that can cover UI in dev (LogBox renders
// as an overlay). The underlying issues are still visible in the Metro
// console; we just prevent them from blocking taps on the chat input.
// NOTE: 'Encountered two children with the same key' is intentionally NOT
// suppressed — duplicate keys cause a Fabric double-removeViewAt crash on
// large unmounts (logout). Keep it visible until the source is fixed.
LogBox.ignoreLogs([
  'This method is deprecated',
  'No Firebase App',
]);

/**
 * Navigate to IncomingCallModal once navigation is ready. Uses a short
 * polling loop to handle the cold-start case where this is invoked before
 * NavigationContainer mounts.
 */
function navigateToIncomingCall(params: IncomingCallNavParams): void {
  const tryNav = (attempt = 0): void => {
    if (navigationRef.isReady()) {
      (navigationRef.navigate as (...args: unknown[]) => void)(
        'IncomingCallModal',
        params,
      );
      return;
    }
    if (attempt < 20) {
      setTimeout(() => tryNav(attempt + 1), 100);
    }
  };
  tryNav();
}

function showSessionEndedDialog(): void {
  koolaConfirm({
    title: 'Phiên làm việc đã kết thúc',
    message: SESSION_ENDED_MESSAGE,
    confirmLabel: 'ĐÃ HIỂU',
    cancelLabel: 'ĐÓNG',
    onConfirm: () => {},
  });
}

/** Carry out a business push tap (business-members task 17.2). */
async function runBusinessTapAction(
  action: BusinessTapAction,
  auth: {
    activeAccountId: string | undefined;
    switchAccount: (id: string) => Promise<void>;
    switchBackToPersonal: () => Promise<void>;
  },
): Promise<void> {
  switch (action.kind) {
    case 'ignore':
      return;
    case 'drop_to_personal':
      try {
        await auth.switchBackToPersonal();
      } catch (err) {
        console.warn('[App] Session-ended tap: switch to personal failed', err);
      }
      showSessionEndedDialog();
      return;
    case 'notice':
      showSessionEndedDialog();
      return;
    case 'open_audit_log':
      // The audit log reads the ACTIVE business, so switch first. If that
      // fails (removed from the business, suspended), opening the screen would
      // show another account's data — stop instead.
      if (auth.activeAccountId !== action.businessId) {
        try {
          await auth.switchAccount(action.businessId);
        } catch (err) {
          console.warn('[App] Business event tap: switchAccount failed', err);
          return;
        }
      }
      setTimeout(() => {
        if (!navigationRef.isReady()) return;
        (navigationRef.navigate as (...args: unknown[]) => void)('Main', {
          screen: 'PersonalTab',
          params: { screen: 'AuditLog' },
        });
      }, 500);
      return;
  }
}

/** StatusBar that follows the active theme palette */
const ThemedStatusBar: React.FC = () => {
  const { resolvedScheme } = useTheme();
  return (
    <StatusBar
      translucent={true}
      backgroundColor="transparent"
      barStyle={resolvedScheme === 'dark' ? 'light-content' : 'dark-content'}
    />
  );
};

/** Inner component that uses hooks requiring AuthProvider context */
const AppInner: React.FC = () => {
  useIncomingCall();
  const {
    isAuthenticated,
    activeAccount,
    switchAccount,
    switchBackToPersonal,
    isSwitchingAccount,
    sessionEndedNotice,
    clearSessionEndedNotice,
  } = useAuth();

  /**
   * Business session revoked on this device (business-members task 17.1).
   *
   * Shown at the app root rather than per-screen: the 401 can land on any
   * screen, and AuthContext has already dropped back to the personal account
   * by the time this renders. A dialog (not a toast) because the user's
   * context just changed underneath them and they should acknowledge it.
   */
  useEffect(() => {
    if (!sessionEndedNotice) return;
    koolaConfirm({
      title: 'Phiên làm việc đã kết thúc',
      message: sessionEndedNotice,
      confirmLabel: 'ĐÃ HIỂU',
      cancelLabel: 'ĐÓNG',
      onConfirm: clearSessionEndedNotice,
      onCancel: clearSessionEndedNotice,
    });
  }, [sessionEndedNotice, clearSessionEndedNotice]);

  // Replay any pending incoming-call payload (delivered via FCM while app
  // was killed/background) and listen for foreground call pushes. Both gated
  // on auth so we don't navigate to a screen the user can't act on.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    void consumePendingIncomingCall().then((pending) => {
      if (cancelled || !pending) return;
      navigateToIncomingCall({
        sessionId: pending.sessionId,
        callType: pending.callType,
        remoteUser: {
          id: pending.callerId,
          displayName: pending.callerName,
          avatar: pending.callerAvatar,
        },
      });
    });

    const unsubscribe = registerFcmCallForegroundHandler(
      navigateToIncomingCall,
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isAuthenticated]);

  // Latest auth values for the tap handler, which also runs from the push
  // listener (outside the render that created it).
  const activeAccountIdRef = useRef(activeAccount?._id);
  activeAccountIdRef.current = activeAccount?._id;
  const switchAccountRef = useRef(switchAccount);
  switchAccountRef.current = switchAccount;
  const switchBackToPersonalRef = useRef(switchBackToPersonal);
  switchBackToPersonalRef.current = switchBackToPersonal;

  // Consume any pending notification tap (new_message with optional accountId).
  // If the tap targets a different account, switch into it first, then navigate.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    const handlePendingTap = () => void consumePendingNotificationTap().then(async (tap) => {
      if (cancelled || !tap) return;
      const { conversationId, accountId, type, orderId } = tap;

      // business-members 17.2. Must branch BEFORE the generic switch below:
      // `accountId` on business pushes is the member's ROOT id, and a
      // session-ended tap must never switch into the business (that would
      // re-claim the session and evict the device that just took over).
      if (type === 'business_session_ended' || type === 'business_event') {
        const action = resolveBusinessTap(tap, {
          deviceId: await getDeviceId().catch(() => null),
          activeAccountId: activeAccountIdRef.current,
        });
        if (cancelled) return;
        await runBusinessTapAction(action, {
          activeAccountId: activeAccountIdRef.current,
          switchAccount: switchAccountRef.current,
          switchBackToPersonal: switchBackToPersonalRef.current,
        });
        return;
      }

      // Switch account if the notification targets a different one
      if (accountId && accountId !== activeAccountIdRef.current) {
        try {
          await switchAccountRef.current(accountId);
        } catch (err) {
          console.warn('[App] Notification tap: switchAccount failed', err);
          // Fall through — still navigate, best-effort
        }
      }

      // commerce-orders (3.3): order_update taps route to the account-appropriate detail.
      // After switchAccount, activeAccount reflects the notification's accountType.
      if (type === 'order_update' && orderId) {
        setTimeout(() => {
          if (navigationRef.isReady()) {
            const targetAccountType = (tap as { accountType?: string }).accountType;
            if (targetAccountType === 'business') {
              (navigationRef.navigate as (...args: unknown[]) => void)('Main', {
                screen: 'ShoppingTab',
                params: {
                  screen: 'ShoppingOrderDetail',
                  params: { orderId },
                },
              });
            } else {
              (navigationRef.navigate as (...args: unknown[]) => void)('Main', {
                screen: 'PersonalTab',
                params: {
                  screen: 'PersonalOrderDetail',
                  params: { orderId },
                },
              });
            }
          }
        }, 500);
        return;
      }

      if (conversationId) {
        setTimeout(() => {
          if (navigationRef.isReady()) {
            (navigationRef.navigate as (...args: unknown[]) => void)('Main', {
              screen: 'ChatTab',
              params: {
                screen: 'Chat',
                params: { conversationId },
              },
            });
          }
        }, 500);
      }
    });

    handlePendingTap();
    // A tap that resumes an already-signed-in app (background → foreground)
    // never flips `isAuthenticated`, so also consume as soon as one is parked.
    const unsubscribe = onPendingNotificationTap(handlePendingTap);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  // Re-run when auth state changes so a tap from quit state is handled after
  // restoreSession completes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return (
    <>
      <RootNavigator />
      {isSwitchingAccount && (
        <View style={styles.switchOverlay} pointerEvents="auto">
          <View style={styles.switchCard}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.switchText}>Đang chuyển tài khoản…</Text>
          </View>
        </View>
      )}
    </>
  );
};

const App: React.FC = () => {
  // Restore offline queue + init push notifications on mount.
  // loadMediaIndex() ensures the in-memory media index has been hydrated from
  // MMKV. The eager top-level load() at module-import time normally completes
  // first, so this call is a belt-and-suspenders no-op; it remains explicit
  // to guarantee freshness if the import order ever changes. Failures are
  // non-fatal: an empty index just means more cache misses on first launch.
  useEffect(() => {
    loadMediaIndex().catch((err) => {
      console.warn('[App] Media index load failed:', err);
    });
    offlineQueueService.restore();
    pushNotificationService.init().catch((err) => {
      console.error('[App] Push init error:', err);
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
      <ThemeProvider>
        <ThemedStatusBar />
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <KeyboardProvider
            statusBarTranslucent
            navigationBarTranslucent
            preserveEdgeToEdge>
            <AuthProvider>
              <AppInner />
            </AuthProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
        {/* Root singleton stays mounted for the full app lifetime. Custom
            renderers consume theme tokens without adding screen-local hosts.
            KoolaConfirmHost (koolaConfirm) sits above navigation, below Toast. */}
        <KoolaConfirmHost />
        <Toast config={koolaToastConfig} />
      </ThemeProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  // Full-screen blocking overlay shown while switchAccount() tears down and
  // re-initialises the new account (token swap + SQLite re-init + socket
  // reconnect). pointerEvents:'auto' blocks taps so the user can't interact
  // with the previous account's still-mounted screens mid-switch.
  switchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  switchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 12,
  },
  switchText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
});

export default App;
