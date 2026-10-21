/**
 * useConversationQuickActions.ts
 *
 * Pin / mute / clear-for-me actions for the conversation list.
 *
 * - Pin and mute apply optimistically and roll back on API failure.
 * - Clear is applied locally only after the server confirms, behind a
 *   destructive koolaConfirm dialog.
 * - None of these actions are queued offline (fire directly; failure rolls
 *   back with a toast).
 * - Flag-on (local-first): SQLite is the source of truth — write the repo and
 *   let the subscription re-render. Flag-off: patch the in-memory list with
 *   pinned-first ordering.
 */
import React from 'react';
import Toast from 'react-native-toast-message';
import type { Conversation } from '../../types';
import { conversationsApi } from '../../services/api/apiService';
import * as conversationRepository from '../../services/db/conversationRepository';
import { koolaConfirm } from '../../ui/KoolaConfirmHost';
import type { MuteDurationChoice } from '../../components/ConversationActionSheet';
import { sortConversations } from './conversationListPrefs';

export type QuickAction = 'pin' | 'mute' | 'clear';

type ApiMuteDuration = '1h' | '8h' | '24h' | 'forever' | 'off';

interface Options {
  localFirstEnabled: boolean;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  /**
   * Registers a tab-dock suppressor; returns an idempotent release.
   * When omitted (e.g. tests), sheet open/close is state-only.
   */
  suppressTabDock?: () => () => void;
}

function toRepoMutedUntil(
  mutedUntil: string | null | undefined,
): number | string | null | undefined {
  if (mutedUntil === undefined) return undefined;
  if (mutedUntil === null) return null;
  return mutedUntil;
}

export function useConversationQuickActions({
  localFirstEnabled,
  setConversations,
  suppressTabDock,
}: Options) {
  const [sheetTarget, setSheetTarget] = React.useState<Conversation | null>(null);
  const [sheetView, setSheetView] = React.useState<'main' | 'mute'>('main');

  // Holds the active dock-suppression release while the sheet is open.
  // Suppress synchronously in openSheet (not in an effect after render) so the
  // dock hides the moment the popup appears, even under JS load.
  const suppressReleaseRef = React.useRef<(() => void) | null>(null);

  const openSheet = React.useCallback(
    (c: Conversation, view: 'main' | 'mute' = 'main') => {
      // Re-open while open (e.g. retarget) must not stack suppressors.
      if (suppressReleaseRef.current === null && suppressTabDock) {
        suppressReleaseRef.current = suppressTabDock();
      }
      setSheetView(view);
      setSheetTarget(c);
    },
    [suppressTabDock],
  );
  const closeSheet = React.useCallback(() => {
    if (suppressReleaseRef.current !== null) {
      suppressReleaseRef.current();
      suppressReleaseRef.current = null;
    }
    setSheetTarget(null);
  }, []);

  // Safety net: release the suppressor if the hook unmounts with the sheet open.
  React.useEffect(
    () => () => {
      if (suppressReleaseRef.current !== null) {
        suppressReleaseRef.current();
        suppressReleaseRef.current = null;
      }
    },
    [],
  );

  // ─── Optimistic pin/mute core ──────────────────────────────────────────

  const applyOptimistic = React.useCallback(
    async (
      conv: Conversation,
      patch: { pinned?: boolean; muteDuration?: ApiMuteDuration },
      rollbackToast = 'Không thể cập nhật hội thoại. Thử lại.',
    ): Promise<void> => {
      // Snapshot the previous prefs for rollback.
      const prev = localFirstEnabled
        ? conversationRepository.getById(conv._id)
        : null;
      const prevPinned = localFirstEnabled
        ? (prev?.pinned ?? false)
        : (conv.pinned ?? false);
      const prevMutedUntil = localFirstEnabled
        ? (prev?.mutedUntil ?? 0)
        : undefined;

      // Optimistic write.
      if (localFirstEnabled) {
        try {
          conversationRepository.updatePrefs(conv._id, {
            pinned: patch.pinned,
            mutedUntil:
              patch.muteDuration !== undefined
                ? patch.muteDuration === 'off'
                  ? null
                  : patch.muteDuration === 'forever'
                    ? '9999-12-31T23:59:59.999Z'
                    : new Date(
                        Date.now() +
                          durationMs(patch.muteDuration),
                      ).toISOString()
                : undefined,
          });
        } catch (e) {
          console.warn('[quickActions] optimistic SQLite write failed', e);
        }
      } else {
        setConversations((list) =>
          sortConversations(
            list.map((c) =>
              c._id === conv._id
                ? {
                    ...c,
                    pinned: patch.pinned ?? c.pinned,
                    mutedUntil:
                      patch.muteDuration !== undefined
                        ? patch.muteDuration === 'off'
                          ? null
                          : patch.muteDuration === 'forever'
                            ? '9999-12-31T23:59:59.999Z'
                            : new Date(
                                Date.now() + durationMs(patch.muteDuration),
                              ).toISOString()
                        : c.mutedUntil,
                  }
                : c,
            ),
          ),
        );
      }

      try {
        const res = await conversationsApi.updatePrefs(conv._id, patch);
        // Authoritative reconcile: the server is the source of truth for the
        // exact timestamps (mutedUntil). Prefs survive REST refresh because
        // every seed path writes real server values.
        if (localFirstEnabled) {
          try {
            conversationRepository.updatePrefs(conv._id, {
              pinned: res.pinned,
              mutedUntil: toRepoMutedUntil(res.mutedUntil),
            });
          } catch (e) {
            console.warn('[quickActions] reconcile SQLite write failed', e);
          }
        } else {
          setConversations((list) =>
            sortConversations(
              list.map((c) =>
                c._id === conv._id
                  ? { ...c, pinned: res.pinned, mutedUntil: res.mutedUntil }
                  : c,
              ),
            ),
          );
        }
      } catch (err: unknown) {
        // Roll back the optimistic write.
        if (localFirstEnabled) {
          try {
            conversationRepository.updatePrefs(conv._id, {
              pinned: patch.pinned !== undefined ? prevPinned : undefined,
              mutedUntil:
                patch.muteDuration !== undefined ? prevMutedUntil : undefined,
            });
          } catch (e) {
            console.warn('[quickActions] rollback SQLite write failed', e);
          }
        } else {
          setConversations((list) =>
            sortConversations(
              list.map((c) =>
                c._id === conv._id
                  ? { ...c, pinned: prevPinned, mutedUntil: conv.mutedUntil }
                  : c,
              ),
            ),
          );
        }
        const code = (err as { response?: { data?: { code?: string } } })
          ?.response?.data?.code;
        Toast.show({
          type: 'error',
          text1:
            code === 'PIN_LIMIT_REACHED'
              ? 'Chỉ ghim tối đa 5 hội thoại'
              : rollbackToast,
          visibilityTime: 2500,
        });
      }
    },
    [localFirstEnabled, setConversations],
  );

  const togglePin = React.useCallback(
    (conv: Conversation) => {
      const pinned = !(conv.pinned === true);
      void applyOptimistic(conv, { pinned });
    },
    [applyOptimistic],
  );

  const unmute = React.useCallback(
    (conv: Conversation) => {
      void applyOptimistic(conv, { muteDuration: 'off' });
    },
    [applyOptimistic],
  );

  const muteFor = React.useCallback(
    (conv: Conversation, duration: MuteDurationChoice) => {
      void applyOptimistic(conv, { muteDuration: duration });
    },
    [applyOptimistic],
  );

  // ─── Clear (confirm → API → local delete) ──────────────────────────────

  const clearConversation = React.useCallback(
    (conv: Conversation) => {
      koolaConfirm({
        title: 'Xoá hội thoại?',
        message:
          'Lịch sử trò chuyện sẽ bị xoá ở phía bạn. Người khác vẫn giữ tin nhắn.',
        confirmLabel: 'XOÁ',
        cancelLabel: 'HUỶ',
        destructive: true,
        onConfirm: () => {
          void (async () => {
            try {
              const res = await conversationsApi.clear(conv._id);
              const clearedAtMs = res.clearedAt
                ? new Date(res.clearedAt).getTime()
                : Date.now();
              if (localFirstEnabled) {
                try {
                  conversationRepository.clearForMe(conv._id, clearedAtMs);
                } catch (e) {
                  console.warn('[quickActions] clearForMe failed', e);
                  Toast.show({
                    type: 'error',
                    text1: 'Không thể xoá hội thoại. Thử lại.',
                    visibilityTime: 2500,
                  });
                  return;
                }
              } else {
                setConversations((list) =>
                  list.filter((c) => c._id !== conv._id),
                );
              }
              closeSheet();
            } catch {
              Toast.show({
                type: 'error',
                text1: 'Không thể xoá hội thoại. Thử lại.',
                visibilityTime: 2500,
              });
            }
          })();
        },
      });
    },
    [localFirstEnabled, setConversations, closeSheet],
  );

  // ─── Sheet + accessibility entry points ────────────────────────────────

  const quickAction = React.useCallback(
    (conv: Conversation, action: QuickAction) => {
      if (action === 'pin') togglePin(conv);
      else if (action === 'mute') {
        // Muted → unmute immediately; unmuted → open the sheet on the mute
        // view so the user picks a duration (same operation as the sheet).
        const muted =
          !!conv.mutedUntil &&
          new Date(conv.mutedUntil).getTime() > Date.now();
        if (muted) unmute(conv);
        else openSheet(conv, 'mute');
      } else clearConversation(conv);
    },
    [togglePin, unmute, clearConversation, openSheet],
  );

  return {
    sheetTarget,
    sheetView,
    openSheet,
    closeSheet,
    togglePin,
    unmute,
    muteFor,
    clearConversation,
    quickAction,
  };
}

function durationMs(d: Exclude<ApiMuteDuration, 'forever' | 'off'>): number {
  if (d === '1h') return 60 * 60 * 1000;
  if (d === '8h') return 8 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}
