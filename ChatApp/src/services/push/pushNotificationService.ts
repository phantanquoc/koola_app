import messaging from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid } from 'react-native';
import { usersApi } from '../api/apiService';
import { navigationRef } from '../../navigation/RootNavigator';

class PushNotificationService {
  private registered = false;

  // ─── Initialize ─────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    await this.requestPermission();
    this.setupListeners();
  }

  // ─── Permission ─────────────────────────────────────────────────────────────

  async requestPermission(): Promise<boolean> {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    const authStatus = await messaging().requestPermission();
    return (
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL
    );
  }

  // ─── Token Registration ─────────────────────────────────────────────────────

  async registerToken(): Promise<void> {
    if (this.registered) return;

    try {
      const token = await messaging().getToken();
      if (token) {
        const platform = Platform.OS;
        await usersApi.registerFcmToken(token, platform);
        this.registered = true;
        console.log('[Push] FCM token registered');
      }
    } catch (err) {
      console.error('[Push] Failed to register FCM token:', err);
    }
  }

  async unregisterToken(): Promise<void> {
    if (!this.registered) return;

    try {
      const token = await messaging().getToken();
      if (token) {
        await usersApi.removeFcmToken(token);
      }
      this.registered = false;
      console.log('[Push] FCM token unregistered');
    } catch (err) {
      console.error('[Push] Failed to unregister FCM token:', err);
    }
  }

  // ─── Token Refresh ──────────────────────────────────────────────────────────

  private setupListeners(): void {
    // Token refresh
    messaging().onTokenRefresh(async (newToken) => {
      try {
        const platform = Platform.OS;
        await usersApi.registerFcmToken(newToken, platform);
        console.log('[Push] FCM token refreshed');
      } catch (err) {
        console.error('[Push] Failed to refresh FCM token:', err);
      }
    });

    // Foreground messages
    messaging().onMessage(async (remoteMessage) => {
      console.log('[Push] Foreground message:', remoteMessage.notification?.title);
      // Foreground messages are handled by socket — no action needed
    });

    // Background/quit → user tapped notification
    messaging().onNotificationOpenedApp((remoteMessage) => {
      this.handleNotificationTap(remoteMessage.data as Record<string, string> | undefined);
    });

    // App opened from quit state via notification
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          this.handleNotificationTap(remoteMessage.data as Record<string, string> | undefined);
        }
      });
  }

  // ─── Navigation on Tap ──────────────────────────────────────────────────────

  private handleNotificationTap(data?: Record<string, string>): void {
    if (!data) return;

    const { conversationId, type } = data;

    if (type === 'new_message' && conversationId) {
      // Navigate to chat screen
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
  }
}

export const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
