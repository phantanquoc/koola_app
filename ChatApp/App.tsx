import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { CallProvider } from './src/contexts/CallContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { IncomingCallOverlay } from './src/components/IncomingCallOverlay';
import { offlineQueueService } from './src/services/OfflineQueueService';

function App(): React.JSX.Element {
  // Restore offline queue on app start
  useEffect(() => {
    offlineQueueService.restore();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <AuthProvider>
        <CallProvider>
          <RootNavigator />
          <IncomingCallOverlay />
        </CallProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default App;
