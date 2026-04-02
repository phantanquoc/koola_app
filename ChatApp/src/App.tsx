import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './contexts/AuthContext';
import RootNavigator from './navigation/RootNavigator';
import { offlineQueueService } from './services/OfflineQueueService';
import { pushNotificationService } from './services/push/pushNotificationService';
import { useIncomingCall } from './hooks/useIncomingCall';

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
