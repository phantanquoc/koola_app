import '../global.css';
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { LogBox, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import RootNavigator, { navigationRef } from './navigation/RootNavigator';
import { offlineQueueService } from './services/OfflineQueueService';
import { pushNotificationService } from './services/push/pushNotificationService';
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
LogBox.ignoreLogs([
  'Encountered two children with the same key',
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
  const { isAuthenticated } = useAuth();

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
    </GestureHandlerRootView>
  );
};

export default App;
