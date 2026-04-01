import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { CallNavigator } from './CallNavigator';
import { SplashScreen } from '../components/SplashScreen';
import { socketService } from '../services/socket/SocketService';
import { notificationService } from '../services/NotificationService';
import type { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

function navigateToChat(conversationId: string) {
  if (!navigationRef.isReady()) return;
  (navigationRef as any).navigate('MainGroup', {
    screen: 'ChatsTab',
    params: { screen: 'Chat', params: { conversationId } },
  });
}

export const RootNavigator: React.FC = () => {
  const { user, isLoading, isAuthenticated } = useAuth();
  const appState = useRef(AppState.currentState);

  // Reconnect socket on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active' &&
        isAuthenticated
      ) {
        if (!socketService.connected) {
          socketService.connect();
        }
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [isAuthenticated]);

  // Notification tap handlers
  useEffect(() => {
    if (!isAuthenticated) return;

    // App was in background when notification tapped
    const unsubOpen = notificationService.onNotificationOpenedApp((remoteMessage) => {
      const conversationId = remoteMessage.data?.conversationId as string | undefined;
      if (conversationId) {
        navigateToChat(conversationId);
      }
    });

    // App was killed — launched from notification tap
    notificationService.getInitialNotification().then((remoteMessage) => {
      if (remoteMessage) {
        const conversationId = remoteMessage.data?.conversationId as string | undefined;
        if (conversationId) {
          // Small delay to let navigation mount
          setTimeout(() => navigateToChat(conversationId), 500);
        }
      }
    });

    return () => unsubOpen();
  }, [isAuthenticated]);

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <RootStack.Screen name="AuthGroup" component={AuthNavigator} />
        ) : (
          <>
            <RootStack.Screen name="MainGroup" component={MainNavigator} />
            <RootStack.Screen
              name="CallModal"
              component={CallNavigator}
              options={{
                presentation: 'transparentModal',
                animation: 'fade',
              }}
            />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
};
