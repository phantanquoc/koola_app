import { useEffect, useSyncExternalStore } from 'react';
import asyncStorage from '../storage/asyncStorage';

/**
 * Translation preferences cache.
 *
 * The authoritative values live on the backend (PUT /users/me/settings) and are
 * returned by GET /users/me. This module-level cache serves two purposes:
 *   1. Provide a synchronous snapshot for auto-translate decisions inside hooks
 *      without awaiting AsyncStorage or a network round-trip every render.
 *   2. Reflect optimistic updates instantly in the UI while the PUT request is
 *      in flight; on failure the caller rolls back via updateTranslationPrefs.
 *
 * Hydration happens once on mount (useTranslationPrefs effect). Subsequent
 * reads return the cached snapshot until an explicit update arrives.
 */

export interface TranslationPrefs {
  autoTranslateEnabled: boolean;
  preferredLanguage: string;
}

const DEFAULT_PREFS: TranslationPrefs = {
  autoTranslateEnabled: false,
  preferredLanguage: 'vi',
};

let prefs: TranslationPrefs = { ...DEFAULT_PREFS };
let hydrated = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function set(next: TranslationPrefs): void {
  prefs = next;
  notify();
}

export function getTranslationPrefs(): TranslationPrefs {
  return prefs;
}

export function subscribeTranslationPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Load persisted preferences from AsyncStorage into the cache. Idempotent —
 * subsequent calls after the first successful load are no-ops. Intentionally
 * swallows errors so a storage glitch does not block the translation feature;
 * defaults remain safe (auto-translate off, target vi).
 */
export async function hydrateTranslationPrefs(): Promise<void> {
  if (hydrated) return;
  try {
    const [autoTranslate, preferredLanguage] = await Promise.all([
      asyncStorage.getAutoTranslate(),
      asyncStorage.getPreferredLanguage(),
    ]);
    hydrated = true;
    set({
      autoTranslateEnabled: autoTranslate,
      preferredLanguage,
    });
  } catch (err) {
    // Swallow — defaults already applied at module init.
    if (__DEV__) {
      console.warn('[translationPrefs] hydration failed:', err);
    }
  }
}

/**
 * Apply a partial preference update. Persists each defined key to AsyncStorage
 * (optimistic) and notifies subscribers synchronously. Callers must handle
 * rollback themselves when the authoritative PUT fails.
 */
export async function updateTranslationPrefs(
  partial: Partial<TranslationPrefs>,
): Promise<void> {
  const next: TranslationPrefs = { ...prefs };
  if (partial.autoTranslateEnabled !== undefined) {
    next.autoTranslateEnabled = partial.autoTranslateEnabled;
    await asyncStorage.setAutoTranslate(partial.autoTranslateEnabled);
  }
  if (partial.preferredLanguage !== undefined) {
    next.preferredLanguage = partial.preferredLanguage;
    await asyncStorage.setPreferredLanguage(partial.preferredLanguage);
  }
  set(next);
}

/**
 * React hook exposing the current translation preferences plus automatic
 * AsyncStorage hydration on first mount. Components that read this hook will
 * re-render only when the preferences object identity changes.
 */
export function useTranslationPrefs(): TranslationPrefs {
  useEffect(() => {
    void hydrateTranslationPrefs();
  }, []);
  return useSyncExternalStore(subscribeTranslationPrefs, getTranslationPrefs);
}
