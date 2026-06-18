import messaging from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usersApi } from '../api/apiService';
import { markAccountBadge } from './accountBadgeStorage';

// ─── Pending notification tap storage ───────────────────────────────────────
// When the user taps a notification while acting as a different account we
// must switch before navigating. The push service cannot call switchAccount
// directly (it has no auth context), so we park the tap payload in
// AsyncStorage and let AppInner consume it once auth is ready — the same
// pattern used by fcmCallHandler for incoming calls.

const PENDING_TAP_KEY = '@push_pending_tap';

export interface PendingNotificationTap {
  type: string;
  conversationId?: string;
  accountId?: string;
  accountType?: string;
  _receivedAt: number;
}

const PENDING_TAP_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function storePendingTap(tap: Omit<PendingNotificationTap, '_receivedAt'>): Promise<void> {
  try {
    await AsyncStorage.setItem(
      PENDING_TAP_KEY,
      JSON.stringify({ ...tap, _receivedAt: Date.now() }),
    );
  } catch (err) {
    console.error('[Push] Failed to store pending tap:', err);
  }
}

export async function consumePendingNotificationTap(): Promise<PendingNotificationTap | null> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(PENDING_TAP_KEY);
  } catch (err) {
    console.error('[Push] Failed to read pending tap:', err);
    return null;
  } finally {
    try {
      await AsyncStorage.removeItem(PENDING_TAP_KEY);
    } catch {
      // best-effort cleanup
    }
  }
  if (!raw) return null;
  try {
    const tap = JSON.parse(raw) as PendingNotificationTap;
    if (
      typeof tap._receivedAt !== 'number' ||
      Date.now() - tap._receivedAt > PENDING_TAP_TTL_MS
    ) {
      return null;
    }
    return tap;
  } catch {
    return null;
  }
}

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
  // The FCM token is always bound to the root user — not to the active business
  // account. switchAccount does NOT re-register the token with a different user.

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
      // Foreground messages are handled by socket for chat updates.
      // Still mark the badge so AccountListScreen can show the dot.
      const data = remoteMessage.data as Record<string, string> | undefined;
      if (data?.accountId) {
        void markAccountBadge(data.accountId);
      }
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
  // Stores the tap payload for AppInner to consume once auth is ready.
  // AppInner handles the account-switch-then-navigate sequence.

  private handleNotificationTap(data?: Record<string, string>): void {
    if (!data) return;

    const { type, conversationId, accountId, accountType } = data;

    if (type === 'new_message' && conversationId) {
      // Mark badge — the tap will clear it once the account becomes active.
      if (accountId) {
        void markAccountBadge(accountId);
      }
      void storePendingTap({ type, conversationId, accountId, accountType });
    }
  }
}

export const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
