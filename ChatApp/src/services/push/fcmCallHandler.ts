import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * FCM call handler — handles incoming-call data messages across app states.
 *
 * Three responsibilities:
 *  1. Background/quit-state messages → write payload to AsyncStorage so the app
 *     can replay it on next launch via `consumePendingIncomingCall`.
 *  2. Foreground messages → navigate directly to IncomingCallModal.
 *  3. Replay-on-resume — `consumePendingIncomingCall` reads the stored payload,
 *     discards stale entries (>45s old), and returns the payload exactly once.
 *
 * Server contract (chat-backend `CallNotificationsService`): data-only push
 * with `type='incoming_call'` and string-typed fields.
 */

const STORAGE_KEY = 'pendingIncomingCall';
/**
 * Discard pending payloads older than this — covers cases where the user
 * opens the app long after the call expired. Backend grace is 25s; we use
 * 45s on the client to give some slack for cold-start timing.
 */
const PENDING_TTL_MS = 45_000;

export interface PendingIncomingCall {
  sessionId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  callType: 'audio' | 'video';
  conversationId: string;
  expiresAt: number;
  /** Local timestamp at which the payload was stored (used for TTL gating). */
  _receivedAt: number;
}

export interface IncomingCallNavParams {
  sessionId: string;
  callType: 'audio' | 'video';
  remoteUser: {
    id: string;
    displayName: string;
    avatar?: string;
  };
}

function parseIncomingCallData(
  data: Record<string, string | object> | undefined,
): Omit<PendingIncomingCall, '_receivedAt'> | null {
  if (!data || data.type !== 'incoming_call') return null;
  return {
    sessionId: String(data.sessionId),
    callerId: String(data.callerId),
    callerName: String(data.callerName),
    callerAvatar: data.callerAvatar ? String(data.callerAvatar) : undefined,
    callType: data.callType as 'audio' | 'video',
    conversationId: String(data.conversationId),
    expiresAt: Number(data.expiresAt),
  };
}

/**
 * Register the background message handler. MUST be called from `index.js`
 * BEFORE `AppRegistry.registerComponent` so RN headless JS can deliver the
 * message to JS even when the app is killed.
 */
export function registerFcmCallBackgroundHandler(): void {
  messaging().setBackgroundMessageHandler(
    async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
      const parsed = parseIncomingCallData(
        remoteMessage.data as Record<string, string> | undefined,
      );
      if (!parsed) return;
      const payload: PendingIncomingCall = {
        ...parsed,
        _receivedAt: Date.now(),
      };
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (err) {
        console.error('[FcmCall] Failed to persist pending call:', err);
      }
    },
  );
}

/**
 * Register the foreground message handler. Call after auth is ready so the
 * navigation target exists. Returns the unsubscribe function from
 * `messaging().onMessage` so callers can detach on unmount.
 */
export function registerFcmCallForegroundHandler(
  navigate: (params: IncomingCallNavParams) => void,
): () => void {
  return messaging().onMessage(async (remoteMessage) => {
    const parsed = parseIncomingCallData(
      remoteMessage.data as Record<string, string> | undefined,
    );
    if (!parsed) return;
    navigate({
      sessionId: parsed.sessionId,
      callType: parsed.callType,
      remoteUser: {
        id: parsed.callerId,
        displayName: parsed.callerName,
        avatar: parsed.callerAvatar,
      },
    });
  });
}

/**
 * Consume the most recent pending incoming-call payload (if any). Always
 * removes the AsyncStorage entry afterwards — this function is single-use.
 * Returns `null` for missing, malformed, or stale (>PENDING_TTL_MS) payloads.
 */
export async function consumePendingIncomingCall(): Promise<PendingIncomingCall | null> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.error('[FcmCall] Failed to read pending call:', err);
    return null;
  } finally {
    // Always clear — pending payload is single-use regardless of validity.
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('[FcmCall] Failed to clear pending call:', err);
    }
  }
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as PendingIncomingCall;
    if (payload.expiresAt != null && Date.now() > Number(payload.expiresAt)) {
      return null;
    }
    if (
      typeof payload._receivedAt !== 'number' ||
      Date.now() - payload._receivedAt > PENDING_TTL_MS
    ) {
      return null;
    }
    return payload;
  } catch (err) {
    console.error('[FcmCall] Malformed pending call payload:', err);
    return null;
  }
}
