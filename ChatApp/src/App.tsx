import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './contexts/AuthContext';
import RootNavigator from './navigation/RootNavigator';
import { offlineQueueService } from './services/OfflineQueueService';
import { pushNotificationService } from './services/push/pushNotificationService';
import { useIncomingCall } from './hooks/useIncomingCall';

// Suppress non-critical RN warnings that can cover UI in dev (LogBox renders
// as an overlay). The underlying issues are still visible in the Metro
// console; we just prevent them from blocking taps on the chat input.
LogBox.ignoreLogs([
  'Encountered two children with the same key',
  'This method is deprecated',
  'No Firebase App',
]);

/** Inner component that uses hooks requiring AuthProvider context */
const AppInner: React.FC = () => {
  useIncomingCall();

  return <RootNavigator />;
};

const App: React.FC = () => {
  // Restore offline queue + init push notifications on mount
  useEffect(() => {
    offlineQueueService.restore();
    pushNotificationService.init().catch((err) => {
      console.error('[App] Push init error:', err);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </SafeAreaProvider>
  );
};

export default App;
