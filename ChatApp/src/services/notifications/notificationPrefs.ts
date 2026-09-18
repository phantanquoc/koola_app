import { useEffect, useSyncExternalStore } from 'react';
import asyncStorage from '../storage/asyncStorage';
import type { NotificationPrefsData } from '../storage/asyncStorage';

/**
 * Notification detail preferences — MOCK / UI-only.
 *
 * These 6 sub-toggles live entirely on-device. There is no backend endpoint,
 * DTO field, or gate on real notification delivery behind them — flipping
 * them only changes what this cache (and therefore the UI) reports. See the
 * caption rendered alongside these rows in SettingsDetailScreen for the
 * user-facing disclosure.
 *
 * Structure mirrors services/translation/translationPrefs.ts: a module-level
 * cache, a listener set for useSyncExternalStore, an idempotent hydrate, and
 * a partial update that persists then notifies.
 */

export type NotificationPrefs = NotificationPrefsData;

const DEFAULT_PREFS: NotificationPrefs = {
  directMessages: true,
  groupMessages: true,
  momentsMentions: true,
  shopping: true,
  connect: true,
  services: true,
};

let prefs: NotificationPrefs = { ...DEFAULT_PREFS };
let hydrated = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function set(next: NotificationPrefs): void {
  prefs = next;
  notify();
}

export function getNotificationPrefs(): NotificationPrefs {
  return prefs;
}

export function subscribeNotificationPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Load persisted preferences from AsyncStorage into the cache. Idempotent —
 * subsequent calls after the first successful load are no-ops. Intentionally
 * swallows errors so a storage glitch does not block the settings screen;
 * defaults remain safe (all notification categories on).
 */
export async function hydrateNotificationPrefs(): Promise<void> {
  if (hydrated) return;
  try {
    const stored = await asyncStorage.getNotificationPrefs();
    hydrated = true;
    set({ ...DEFAULT_PREFS, ...stored });
  } catch (err) {
    // Swallow — defaults already applied at module init.
    if (__DEV__) {
      console.warn('[notificationPrefs] hydration failed:', err);
    }
  }
}

/**
 * Apply a partial preference update. Persists the merged object to
 * AsyncStorage as a single JSON blob and notifies subscribers synchronously.
 * Purely local — there is no authoritative server value to roll back to on
 * failure, so callers do not need try/catch/Alert around this.
 */
export async function updateNotificationPrefs(
  partial: Partial<NotificationPrefs>,
): Promise<void> {
  const next: NotificationPrefs = { ...prefs, ...partial };
  await asyncStorage.setNotificationPrefs(next);
  set(next);
}

/**
 * React hook exposing the current notification preferences plus automatic
 * AsyncStorage hydration on first mount. Components that read this hook will
 * re-render only when the preferences object identity changes.
 */
export function useNotificationPrefs(): NotificationPrefs {
  useEffect(() => {
    void hydrateNotificationPrefs();
  }, []);
  return useSyncExternalStore(subscribeNotificationPrefs, getNotificationPrefs);
}
