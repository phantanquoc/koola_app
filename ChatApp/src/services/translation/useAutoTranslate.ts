import { useEffect, useRef, useSyncExternalStore } from 'react';
import translationStore from './translationStore';
import { translate, normalizeText, isTrivial } from './translationService';
import type { TranslatedTextState } from '../../types';

/**
 * Auto-translate hook for a single message row.
 *
 * Drives translationStore based on the auto-translate predicate (design.md D4):
 *   - autoTranslateEnabled is true
 *   - message is text, non-empty, normalized length >= 3
 *   - message is NOT owned by the current user
 *   - message is NOT a system message
 *
 * Post-call: if detected sourceLang equals preferredLanguage, skip setResult
 * (same-language skip per D4 — leave no entry so the subtitle slot stays empty).
 * Failures are silent (no entry) per design.md D6; manual "Dịch" in the context
 * menu surfaces errors via Toast instead.
 *
 * Returns the current TranslatedTextState snapshot plus a toggle() callback for
 * the expand/collapse gesture. When nothing has been recorded yet and no request
 * is in flight, all fields are at their neutral defaults.
 */

export interface UseAutoTranslateArgs {
  messageId: string;
  text: string;
  isOwn: boolean;
  isSystem: boolean;
  preferredLanguage: string;
  autoTranslateEnabled: boolean;
}

export interface UseAutoTranslateResult {
  translatedText: string;
  isLoading: boolean;
  error: boolean;
  collapsed: boolean;
  toggle: () => void;
}

const EMPTY_STATE: TranslatedTextState = {
  translatedText: '',
  isLoading: false,
  error: false,
  collapsed: true,
};

export function useAutoTranslate(args: UseAutoTranslateArgs): UseAutoTranslateResult {
  const { messageId, text, isOwn, isSystem, preferredLanguage, autoTranslateEnabled } = args;

  const state = useSyncExternalStore(
    translationStore.subscribe,
    () => translationStore.get(messageId),
  );

  // Track which messageId we have already kicked off to avoid re-firing when
  // React strict mode double-invokes effects or when unrelated props update.
  const triggeredRef = useRef<string | null>(null);

  useEffect(() => {
    // Reset trigger tracking when the message identity changes.
    if (triggeredRef.current !== messageId) {
      triggeredRef.current = null;
    }

    if (!autoTranslateEnabled) return;
    if (isOwn || isSystem) return;
    const normalized = normalizeText(text);
    if (isTrivial(normalized)) return;
    if (triggeredRef.current === messageId) return;

    // Mark as triggered BEFORE awaiting so concurrent renders do not re-fire.
    triggeredRef.current = messageId;
    translationStore.setLoading(messageId);

    let cancelled = false;
    (async () => {
      try {
        const result = await translate(normalized, preferredLanguage);
        if (cancelled) return;
        // Same-language skip per D4 — drop the loading entry entirely so the
        // subtitle slot never mounts.
        if (result.sourceLang === preferredLanguage) {
          translationStore.clear(messageId);
          return;
        }
        translationStore.setResult(messageId, result.translatedText);
      } catch {
        if (cancelled) return;
        // Silent failure for auto-translate per D6. Clear the loading entry so
        // the bubble does not show a stuck "Đang dịch…" indefinitely.
        translationStore.clear(messageId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [autoTranslateEnabled, isOwn, isSystem, messageId, preferredLanguage, text]);

  const toggle = () => {
    translationStore.toggleCollapsed(messageId);
  };

  const resolved = state ?? EMPTY_STATE;
  return {
    translatedText: resolved.translatedText,
    isLoading: resolved.isLoading,
    error: resolved.error,
    collapsed: resolved.collapsed,
    toggle,
  };
}
