import type { TranslatedTextState } from '../../types';

/**
 * External store for per-message translation state.
 *
 * Translation results are deliberately NOT stored on the message objects that
 * flow through GiftedChat (tasks.md 4.4 + orchestrator constraint: do not make
 * dbMsgToGifted async, do not re-render the whole list when one translation
 * arrives). Instead this module-level Map holds TranslatedTextState keyed by
 * message id, and each mounted TranslatedText row subscribes to it via
 * useSyncExternalStore.
 *
 * Notification is broadcast to all listeners, but getSnapshot returns the same
 * Map-held object reference for unchanged rows, so React only re-renders rows
 * whose snapshot identity actually changed. Setters always allocate a NEW
 * state object before notifying.
 */

const entries = new Map<string, TranslatedTextState>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function set(messageId: string, next: TranslatedTextState): void {
  entries.set(messageId, next);
  notify();
}

export const translationStore = {
  /**
   * Returns the current state for a message, or undefined when nothing has been
   * recorded yet. The returned reference is stable until the next setter call
   * for this id — required for useSyncExternalStore snapshot equality.
   */
  get(messageId: string): TranslatedTextState | undefined {
    return entries.get(messageId);
  },

  /** useSyncExternalStore subscription. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Mark a translation request in flight for this message. */
  setLoading(messageId: string): void {
    set(messageId, {
      translatedText: '',
      isLoading: true,
      error: false,
      collapsed: true,
    });
  },

  /** Record a successful translation; subtitle starts collapsed by default. */
  setResult(messageId: string, translatedText: string): void {
    set(messageId, {
      translatedText,
      isLoading: false,
      error: false,
      collapsed: true,
    });
  },

  /** Record a failure. The subtitle slot stays empty (no layout shift). */
  setError(messageId: string): void {
    set(messageId, {
      translatedText: '',
      isLoading: false,
      error: true,
      collapsed: true,
    });
  },

  /** Toggle the collapsed/expanded subtitle line for this message. */
  toggleCollapsed(messageId: string): void {
    const current = entries.get(messageId);
    if (!current) return;
    set(messageId, { ...current, collapsed: !current.collapsed });
  },

  /** Remove the entry for a message (e.g. after a failed manual attempt). */
  clear(messageId: string): void {
    if (!entries.has(messageId)) return;
    entries.delete(messageId);
    notify();
  },

  /** Drop all translation state (logout/reset). */
  clearAll(): void {
    if (entries.size === 0) return;
    entries.clear();
    notify();
  },
};

export default translationStore;
