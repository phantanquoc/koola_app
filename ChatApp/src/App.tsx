import '../global.css';
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { LogBox, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import Toast from 'react-native-toast-message';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import RootNavigator, { navigationRef } from './navigation/RootNavigator';
import { offlineQueueService } from './services/OfflineQueueService';
import {
  pushNotificationService,
  consumePendingNotificationTap,
} from './services/push/pushNotificationService';
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

/** Inner component that uses hooks requiring AuthProvider context */
const AppInner: React.FC = () => {
  useIncomingCall();
  const { isAuthenticated, activeAccount, switchAccount } = useAuth();

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

  // Consume any pending notification tap (new_message with optional accountId).
  // If the tap targets a different account, switch into it first, then navigate.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    void consumePendingNotificationTap().then(async (tap) => {
      if (cancelled || !tap) return;
      const { conversationId, accountId } = tap;

      // Switch account if the notification targets a different one
      if (accountId && accountId !== activeAccount?._id) {
        try {
          await switchAccount(accountId);
        } catch (err) {
          console.warn('[App] Notification tap: switchAccount failed', err);
          // Fall through — still navigate, best-effort
        }
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

    return () => {
      cancelled = true;
    };
  // Re-run when auth state changes so a tap from quit state is handled after
  // restoreSession completes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return <RootNavigator />;
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
      <StatusBar translucent={false} backgroundColor="#FFFFFF" barStyle="dark-content" />
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <KeyboardProvider>
          <AuthProvider>
            <AppInner />
          </AuthProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
      {/* Toast must be a root-level singleton, rendered last so its overlay sits
          above everything. Rendering it inside a screen (ChatScreen) put the
          overlay deep in a conditionally-unmounted tree → Fabric double-remove
          crash on logout. See [[logout_removeviewat_crash]]. */}
      <Toast />
    </GestureHandlerRootView>
  );
};

export default App;
