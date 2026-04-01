/**
 * NotificationService — handles FCM token management, push permission,
 * foreground/background message handling, and notification-tap deep linking.
 */
import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { usersApi } from './api/apiService';
import { storage } from '../utils/asyncStorage';

const FCM_TOKEN_KEY = 'fcm_token';

class NotificationService {
  private currentToken: string | null = null;

  /** Request push permission (iOS prompts user, Android auto-grants) */
  async requestPermission(): Promise<boolean> {
    const authStatus = await messaging().requestPermission();
    return (
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL
    );
  }

  /** Get FCM token, register with backend, persist locally */
  async registerToken(): Promise<string | null> {
    try {
      const granted = await this.requestPermission();
      if (!granted) return null;

      const token = await messaging().getToken();
      if (!token) return null;

      const platform = Platform.OS; // 'ios' | 'android'
      await usersApi.updateFcmToken(token, platform);

      this.currentToken = token;
      await storage.setFcmToken(token);
      return token;
    } catch {
      return null;
    }
  }

  /** Remove current token from backend + local storage */
  async unregisterToken(): Promise<void> {
    try {
      const token = this.currentToken ?? (await storage.getFcmToken());
      if (token) {
        await usersApi.removeFcmToken(token);
      }
    } catch {
      // Best-effort — backend also clears on logout
    }
    this.currentToken = null;
    await storage.clearFcmToken();
  }

  /** Listen for token refresh — re-register automatically */
  onTokenRefresh(callback?: (token: string) => void): () => void {
    return messaging().onTokenRefresh(async (newToken) => {
      const platform = Platform.OS;
      try {
        await usersApi.updateFcmToken(newToken, platform);
        this.currentToken = newToken;
        await storage.setFcmToken(newToken);
      } catch {
        // Non-fatal
      }
      callback?.(newToken);
    });
  }

  /** Foreground message listener — returns unsubscribe fn */
  onForegroundMessage(
    handler: (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => void,
  ): () => void {
    return messaging().onMessage(handler);
  }

  /** Must be called from index.js (outside React tree) */
  setBackgroundMessageHandler(
    handler: (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => Promise<void>,
  ): void {
    messaging().setBackgroundMessageHandler(handler);
  }

  /** Handle notification tap when app was in background */
  onNotificationOpenedApp(
    handler: (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => void,
  ): () => void {
    return messaging().onNotificationOpenedApp(handler);
  }

  /** Handle notification tap that launched the app from quit state */
  async getInitialNotification(): Promise<FirebaseMessagingTypes.RemoteMessage | null> {
    return messaging().getInitialNotification();
  }
}

export const notificationService = new NotificationService();
