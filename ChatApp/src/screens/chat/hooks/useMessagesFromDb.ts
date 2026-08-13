/**
 * useMessagesFromDb.ts
 *
 * SQLite-backed implementation of the useMessages interface.
 * Used when LOCAL_FIRST_SQLITE flag is on.
 *
 * Reads from messageRepository + subscription (reactive).
 * Writes route through outboxRepository.enqueue() — the outboxProcessor
 * dispatches them to the REST API with retry/backoff.
 *
 * Change B: all 6 write methods now enqueue instead of calling messagesApi directly.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as messageRepository from '../../../services/db/messageRepository';
import * as outboxRepository from '../../../services/db/outboxRepository';
import type { MessageInput } from '../../../services/db/messageRepository';
import { syncOnOpen } from '../../../services/sync/syncOrchestrator';
import type { IMessage } from 'react-native-gifted-chat';
import type { MessageReaction } from '../../../types';

/** Simple unique ID generator */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}

function dbMsgToGifted(
  msg: MessageInput,
  currentUserId: string,
): IMessage & Record<string, unknown> {
  const base: IMessage & Record<string, unknown> = {
    _id: msg.id,
    text: msg.deleted
      ? 'This message was deleted'
      : msg.type === 'image' || msg.type === 'video'
      ? ''
      : msg.content ?? '',
    createdAt: new Date(msg.createdAt as number),
    user: {
      _id: msg.senderId,
      name: msg.senderId === currentUserId ? 'You' : undefined,
    },
    system: msg.type === 'system',
    reactions: (msg.reactions as MessageReaction[]) ?? [],
    clientMessageId: msg.clientMessageId ?? undefined,
    pending: msg.status === 'pending',
    sent: msg.status !== 'failed',
    failed: msg.status === 'failed',
    // Delivery state — consumed by presentation layer for tick icons
    readBy: (msg.readBy as string[]) ?? [],
    messageStatus: msg.status ?? 'sent',
  };

  if (
    (msg.type === 'image' || msg.type === 'file' || msg.type === 'video') &&
    msg.mediaKey
  ) {
    base.mediaKey = msg.mediaKey;
    base.mediaMimeType = msg.mediaMimeType;
    base.mediaSize = msg.mediaSize;
    base.mediaDuration = msg.mediaDuration;
    base.mediaType = msg.type;
    base.blurhash = msg.blurhash ?? null;
    base.imageWidth = msg.imageWidth ?? undefined;
    base.imageHeight = msg.imageHeight ?? undefined;
    base.mediaThumbnailKey = msg.mediaThumbnailKey ?? null;
    if (msg.type === 'image') base.image = 'media-pending';
    if (msg.type === 'video') base.video = 'media-pending';
  }

  return base;
}

/**
 * How many older messages one `loadEarlier` round trip pulls.
 *
 * Raised from 40 (itself raised from 20, when a 1000-message conversation
 * needed ~48 round trips to reach the top). The fetch now starts a full screen
 * before the list edge (see `onEndReachedThreshold` in ChatScreen), so each
 * round trip must cover more ground than the user can scroll while it runs;
 * the wider page means fewer round trips overall, and every arrival is one
 * fewer merge into the live `messages` state mid-scroll. The query runs on
 * `idx_messages_conv_created (conversation_id, created_at DESC)` and stops at
 * LIMIT, so a wider page costs no extra index work. The rows still mount
 * through FlatList's `maxToRenderPerBatch`, so a bigger page spreads over more
 * batches rather than landing as one hitch.
 */
const EARLIER_PAGE_SIZE = 80;

/**
 * Size of the window read at mount and re-read on a full invalidation.
 *
 * 50 was small enough that the first scroll up already hit the edge and paid for
 * a pagination round trip. Holding 150 rows in state is cheap — they are plain
 * objects and FlatList mounts only `windowSize` of them — and it moves the first
 * "load earlier" well past where a user usually stops.
 */
const INITIAL_WINDOW_SIZE = 150;

function loadFromDb(
  conversationId: string,
  currentUserId: string,
  limit = INITIAL_WINDOW_SIZE,
): IMessage[] {
  const t0 = Date.now();
  const rows = messageRepository.list({ conversationId, currentUserId, limit });
  const tQuery = Date.now();
  const result = rows.map((r) => dbMsgToGifted(r, currentUserId));
  if (__DEV__) {
    console.log(`[PERF useMessagesFromDb] LOAD conv=${conversationId.slice(-6)} queryMs=${tQuery - t0} mapMs=${Date.now() - tQuery} rows=${rows.length}`);
  }
  return result;
}

export function useMessagesFromDb(
  conversationId: string,
  currentUserId: string,
) {
  const [messages, setMessages] = useState<IMessage[]>(() => {
    const t0 = Date.now();
    const result = loadFromDb(conversationId, currentUserId);
    if (__DEV__) {
      console.log(`[PERF useMessagesFromDb] MOUNT conv=${conversationId.slice(-6)} totalMs=${Date.now() - t0} count=${result.length}`);
    }
    return result;
  });
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [_isInitialLoading, _setIsInitialLoading] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [hasEarlier, setHasEarlier] = useState(true);
  // Mirrors of the two pagination flags and of the loaded window, read by
  // `loadEarlier` so that callback never has to list them as dependencies. See
  // the comment on `loadEarlier` for why its identity must stay pinned.
  const hasEarlierRef = useRef(true);
  const isLoadingEarlierRef = useRef(false);
  const visibleMessagesRef = useRef<IMessage[]>([]);
  const mountedRef = useRef(true);
  const loadedKeyRef = useRef(`${conversationId}:${currentUserId}`);
  // Track how many messages are currently loaded so reload preserves the window
  // (prevents truncation back to the initial window after the user scrolled to
  // load earlier messages)
  const loadedCountRef = useRef(INITIAL_WINDOW_SIZE);
  const currentLoadKey = `${conversationId}:${currentUserId}`;
  const stateMatchesConversation = loadedKeyRef.current === currentLoadKey;
  const visibleMessages = stateMatchesConversation
    ? messages
    : loadFromDb(conversationId, currentUserId);
  // Kept in sync on every render rather than in an effect: `loadEarlier` can fire
  // from a scroll before an effect has committed, and reading a stale cursor there
  // would re-request a page the list already holds.
  visibleMessagesRef.current = visibleMessages;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ─── Subscribe to repository invalidations ─────────────────────────────────
  useEffect(() => {
    const key = `${conversationId}:${currentUserId}`;
    if (loadedKeyRef.current !== key) {
      loadedKeyRef.current = key;
      loadedCountRef.current = INITIAL_WINDOW_SIZE;
      setInitialLoadError(null);
      setHasEarlier(true);
      // The ref must be reset alongside the state it mirrors. Without this, a
      // conversation opened after one that had been scrolled to its oldest
      // message would inherit `hasEarlierRef = false` and refuse to paginate,
      // while `hasEarlier` state said otherwise.
      hasEarlierRef.current = true;
      setMessages(loadFromDb(conversationId, currentUserId));
    }

    const handleInvalidation = (payload: any) => {
      if (!mountedRef.current) return;

      // Legacy path: payload is undefined → full reload
      if (!payload) {
        const t0 = Date.now();
        const limit = Math.max(INITIAL_WINDOW_SIZE, loadedCountRef.current);
        const fresh = loadFromDb(conversationId, currentUserId, limit);
        loadedKeyRef.current = key;
        loadedCountRef.current = fresh.length;
        setMessages(fresh);
        if (__DEV__) {
          console.log(`[PERF useMessagesFromDb] RELOAD conv=${conversationId.slice(-6)} ms=${Date.now() - t0} count=${fresh.length} limit=${limit}`);
        }
        return;
      }

      const { kind, messageIds, orderChanged } = payload;

      // If order changed (insert/batch with new messages), full reload required
      if (orderChanged) {
        const t0 = Date.now();
        const limit = Math.max(INITIAL_WINDOW_SIZE, loadedCountRef.current);
        const fresh = loadFromDb(conversationId, currentUserId, limit);
        loadedKeyRef.current = key;
        loadedCountRef.current = fresh.length;
        setMessages(fresh);
        if (__DEV__) {
          console.log(`[PERF useMessagesFromDb] RELOAD(orderChanged) conv=${conversationId.slice(-6)} ms=${Date.now() - t0} count=${fresh.length}`);
        }
        return;
      }

      // Incremental patch: update/reaction/ack/delete without order change
      const t0 = Date.now();
      setMessages((prev) => {
        const updated = [...prev];
        let changed = false;

        for (const msgId of messageIds || []) {
          const idx = updated.findIndex((m) => String(m._id) === msgId);
          if (idx !== -1) {
            // Message exists in current window — re-fetch it
            const fresh = messageRepository.getById(msgId);
            if (fresh) {
              updated[idx] = dbMsgToGifted(fresh, currentUserId);
              changed = true;
            } else {
              // Message was deleted or filtered out — remove from window
              updated.splice(idx, 1);
              changed = true;
            }
          }
        }

        if (changed && __DEV__) {
          console.log(`[PERF useMessagesFromDb] PATCH kind=${kind} conv=${conversationId.slice(-6)} ms=${Date.now() - t0} affected=${(messageIds || []).length}`);
        }

        return changed ? updated : prev;
      });
    };

    const unsub = messageRepository.subscribe(conversationId, handleInvalidation);

    // Trigger background sync on mount (respects freshness window)
    const tSync = Date.now();
    syncOnOpen(conversationId)
      .then(() => {
        if (__DEV__) {
          console.log(`[PERF useMessagesFromDb] syncOnOpen conv=${conversationId.slice(-6)} ms=${Date.now() - tSync}`);
        }
      })
      .catch((err) =>
        console.warn('[useMessagesFromDb] syncOnOpen error:', err),
      );

    return unsub;
  }, [conversationId, currentUserId]);

  const retryInitialLoad = useCallback(() => {
    setInitialLoadError(null);
    setMessages(loadFromDb(conversationId, currentUserId));
  }, [conversationId, currentUserId]);

  // ─── Load earlier (cursor-based) ──────────────────────────────────────────
  // Every input this reads comes from a ref, so its identity is pinned to the
  // conversation. That is load-bearing rather than cosmetic: it is handed to
  // GiftedChat as `onLoadEarlier` through `MemoizedMessageList`, whose React.memo
  // does a shallow prop compare. While this callback listed `visibleMessages`,
  // `hasEarlier` and `isLoadingEarlier` in its deps it was rebuilt on every
  // message change and on both edges of every load — each rebuild failing that
  // shallow compare and re-rendering the whole chat list, which is exactly the
  // work the memo boundary exists to prevent.
  const loadEarlier = useCallback(async () => {
    if (!hasEarlierRef.current || isLoadingEarlierRef.current) return;
    isLoadingEarlierRef.current = true;
    setIsLoadingEarlier(true);
    try {
      const loaded = visibleMessagesRef.current;
      const oldest = loaded[loaded.length - 1];
      if (!oldest) {
        hasEarlierRef.current = false;
        setHasEarlier(false);
        return;
      }
      const before = new Date(oldest.createdAt as Date).getTime();
      const t0 = Date.now();
      const rows = messageRepository.listBefore({
        conversationId,
        currentUserId,
        before,
        limit: EARLIER_PAGE_SIZE,
      });
      if (rows.length === 0) {
        hasEarlierRef.current = false;
        setHasEarlier(false);
        return;
      }
      const tQuery = Date.now();
      const older = rows.map((r) => dbMsgToGifted(r, currentUserId));
      if (__DEV__) {
        console.log(`[PERF useMessagesFromDb] EARLIER conv=${conversationId.slice(-6)} queryMs=${tQuery - t0} mapMs=${Date.now() - tQuery} rows=${rows.length}`);
      }
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => String(m._id)));
        const newItems = older.filter((m) => !existingIds.has(String(m._id)));
        const merged = [...prev, ...newItems];
        loadedCountRef.current = merged.length;
        return merged;
      });
      // A short page means the cursor reached the oldest stored row.
      const more = rows.length === EARLIER_PAGE_SIZE;
      hasEarlierRef.current = more;
      setHasEarlier(more);
    } catch (err) {
      console.warn('[useMessagesFromDb] loadEarlier:', (err as Error)?.message);
    } finally {
      isLoadingEarlierRef.current = false;
      if (mountedRef.current) setIsLoadingEarlier(false);
    }
  }, [conversationId, currentUserId]);

  // ─── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string, replyTo?: string) => {
      const clientMessageId = generateId();
      const tempId = `temp_${clientMessageId}`;
      const now = Date.now();

      messageRepository.insertOptimistic({
        id: tempId,
        conversationId,
        senderId: currentUserId,
        clientMessageId,
        type: 'text',
        content: text,
        createdAt: now,
        updatedAt: now,
        status: 'pending',
      });

      try {
        outboxRepository.enqueue('send_message', {
          conversationId,
          clientMessageId,
          content: text,
          type: 'text',
          replyTo: replyTo ?? null,
        });
      } catch (err) {
        messageRepository.markFailed(tempId);
        console.warn('[outbox.enqueue:error] sendMessage failed to enqueue:', err);
      }
    },
    [conversationId, currentUserId],
  );

  // ─── Send media message ────────────────────────────────────────────────────
  // Media upload still bypasses outbox; only the POST /messages part is queued.
  const sendMediaMessage = useCallback(
    async (
      mediaUrl: string,
      mediaMimeType: string,
      mediaSize: number,
      type: 'image' | 'file' | 'voice' | 'video',
      filename?: string,
      mediaDuration?: number,
    ) => {
      const clientMessageId = generateId();
      const tempId = `temp_${clientMessageId}`;
      const content =
        filename ||
        (type === 'image'
          ? 'Photo'
          : type === 'voice'
          ? 'Voice'
          : type === 'video'
          ? 'Video'
          : 'File');
      const now = Date.now();

      messageRepository.insertOptimistic({
        id: tempId,
        conversationId,
        senderId: currentUserId,
        clientMessageId,
        type,
        content,
        mediaKey: mediaUrl,
        mediaMimeType,
        mediaSize,
        mediaDuration: mediaDuration ?? null,
        createdAt: now,
        updatedAt: now,
        status: 'pending',
      });

      // Enqueue only the POST /messages part (upload already done)
      try {
        outboxRepository.enqueue('send_message', {
          conversationId,
          clientMessageId,
          content,
          type,
          mediaUrl,
          mediaMimeType,
          mediaSize,
          mediaDuration: mediaDuration ?? null,
        });
      } catch (err) {
        messageRepository.markFailed(tempId);
        console.warn('[outbox.enqueue:error] sendMediaMessage failed to enqueue:', err);
      }
    },
    [conversationId, currentUserId],
  );

  // ─── Create optimistic media (for two-phase upload) ───────────────────────
  const createOptimisticMedia = useCallback(
    (
      mediaKey: string,
      mediaMimeType: string,
      mediaSize: number,
      type: 'image' | 'file' | 'voice' | 'video',
      filename?: string,
      mediaDuration?: number,
    ): string => {
      const clientMessageId = generateId();
      const tempId = `temp_${clientMessageId}`;
      const content =
        filename ||
        (type === 'image'
          ? 'Photo'
          : type === 'voice'
          ? 'Voice'
          : type === 'video'
          ? 'Video'
          : 'File');
      const now = Date.now();

      messageRepository.insertOptimistic({
        id: tempId,
        conversationId,
        senderId: currentUserId,
        clientMessageId,
        type,
        content,
        mediaKey,
        mediaMimeType,
        mediaSize,
        mediaDuration: mediaDuration ?? null,
        createdAt: now,
        updatedAt: now,
        status: 'pending',
      });

      return tempId;
    },
    [conversationId, currentUserId],
  );

  // ─── Confirm media message after upload ───────────────────────────────────
  // After upload completes, enqueue the POST /messages part.
  const confirmMediaMessage = useCallback(
    async (
      tempId: string,
      mediaUrl: string,
      mediaMimeType: string,
      mediaSize: number,
      type: 'image' | 'file' | 'voice' | 'video',
      filename?: string,
      mediaDuration?: number,
    ) => {
      const clientMessageId = tempId.replace('temp_', '');
      const content =
        filename ||
        (type === 'image'
          ? 'Photo'
          : type === 'voice'
          ? 'Voice'
          : type === 'video'
          ? 'Video'
          : 'File');

      try {
        outboxRepository.enqueue('send_message', {
          conversationId,
          clientMessageId,
          content,
          type,
          mediaUrl,
          mediaMimeType,
          mediaSize,
          mediaDuration: mediaDuration ?? null,
        });
      } catch (err) {
        messageRepository.markFailed(tempId);
        console.warn('[outbox.enqueue:error] confirmMediaMessage failed to enqueue:', err);
      }
    },
    [conversationId],
  );

  // ─── Delete message ────────────────────────────────────────────────────────
  const deleteMessage = useCallback(
    async (messageId: string) => {
      // Optimistic: mark deleted in DB immediately
      messageRepository.applySocketEvent({
        type: 'message_deleted',
        payload: { messageId, conversationId },
      });
      try {
        outboxRepository.enqueue('delete', { conversationId, messageId });
      } catch (err) {
        console.warn('[outbox.enqueue:error] deleteMessage failed to enqueue:', err);
        // Rollback: re-upsert the original row (best-effort)
        const row = messageRepository.getById(messageId);
        if (row) {
          messageRepository.upsertMany([{ ...row, deleted: false }]);
        }
      }
    },
    [conversationId],
  );

  // ─── React to message ──────────────────────────────────────────────────────
  // emoji: string to set, null to clear
  const reactToMessage = useCallback(
    async (messageId: string, emoji: string | null) => {
      // Optimistic update via repository
      if (emoji !== null) {
        messageRepository.applySocketEvent({
          type: 'message_reaction',
          payload: {
            messageId,
            conversationId,
            userId: currentUserId,
            emoji,
            action: 'add',
          },
        });
      }
      try {
        outboxRepository.enqueue('react', {
          conversationId,
          messageId,
          userId: currentUserId,
          emoji,
        });
      } catch (err) {
        console.warn('[outbox.enqueue:error] reactToMessage failed to enqueue:', err);
      }
    },
    [conversationId, currentUserId],
  );

  // ─── Delete for me ─────────────────────────────────────────────────────────
  const deleteForMe = useCallback(
    async (messageId: string) => {
      messageRepository.softDeleteForUser(messageId, currentUserId);
      try {
        outboxRepository.enqueue('delete_for_me', { conversationId, messageId });
      } catch (err) {
        console.warn('[outbox.enqueue:error] deleteForMe failed to enqueue:', err);
      }
    },
    [conversationId, currentUserId],
  );

  // ─── Mark as read ──────────────────────────────────────────────────────────
  // dedup_key = conversationId (coalesces to MAX upToTimestamp per conversation)
  const markAsRead = useCallback(
    async (upToTimestamp: number) => {
      try {
        outboxRepository.enqueue('mark_read', { conversationId, upToTimestamp });
      } catch (err) {
        console.warn('[outbox.enqueue:error] markAsRead failed to enqueue:', err);
      }
    },
    [conversationId],
  );

  // ─── Update upload progress ───────────────────────────────────────────────
  // In the DB path, progress is tracked in-memory only (not persisted)
  const [_uploadProgress, setUploadProgress] = useState<
    Record<string, number>
  >({});
  const updateUploadProgress = useCallback(
    (tempId: string, progress: number) => {
      setUploadProgress((prev) => ({ ...prev, [tempId]: progress }));
      // Also update the in-memory message state for UI feedback
      setMessages((prev) =>
        prev.map((m) =>
          m._id === tempId
            ? ({ ...m, uploadProgress: progress } as IMessage)
            : m,
        ),
      );
    },
    [],
  );

  return {
    messages: visibleMessages,
    sendMessage,
    sendMediaMessage,
    createOptimisticMedia,
    confirmMediaMessage,
    loadEarlier,
    deleteMessage,
    reactToMessage,
    deleteForMe,
    markAsRead,
    updateUploadProgress,
    isLoadingEarlier,
    isInitialLoading: _isInitialLoading,
    initialLoadError,
    retryInitialLoad,
    hasEarlier,
  };
}
