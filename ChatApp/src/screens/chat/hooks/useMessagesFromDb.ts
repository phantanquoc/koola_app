/**
 * useMessagesFromDb.ts
 *
 * SQLite-backed implementation of the useMessages interface.
 * Used when LOCAL_FIRST_SQLITE flag is on.
 *
 * Reads from messageRepository + subscription (reactive).
 * Writes still call the same REST endpoints; repository handles
 * optimistic inserts and reconciliation via confirmSend.
 *
 * Task 5.2 + 5.3
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { messagesApi } from '../../../services/api/apiService';
import * as messageRepository from '../../../services/db/messageRepository';
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

function loadFromDb(
  conversationId: string,
  currentUserId: string,
  limit = 50,
): IMessage[] {
  const rows = messageRepository.list({ conversationId, currentUserId, limit });
  return rows.map((r) => dbMsgToGifted(r, currentUserId));
}

export function useMessagesFromDb(
  conversationId: string,
  currentUserId: string,
) {
  const [messages, setMessages] = useState<IMessage[]>(() =>
    loadFromDb(conversationId, currentUserId),
  );
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [hasEarlier, setHasEarlier] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ─── Subscribe to repository invalidations ─────────────────────────────────
  useEffect(() => {
    const reload = () => {
      if (!mountedRef.current) return;
      setMessages(loadFromDb(conversationId, currentUserId));
    };

    const unsub = messageRepository.subscribe(conversationId, reload);

    // Trigger background sync on mount (respects freshness window)
    syncOnOpen(conversationId).catch((err) =>
      console.warn('[useMessagesFromDb] syncOnOpen error:', err),
    );

    return unsub;
  }, [conversationId, currentUserId]);

  const retryInitialLoad = useCallback(() => {
    setInitialLoadError(null);
    setMessages(loadFromDb(conversationId, currentUserId));
  }, [conversationId, currentUserId]);

  // ─── Load earlier (cursor-based) ──────────────────────────────────────────
  const loadEarlier = useCallback(async () => {
    if (!hasEarlier || isLoadingEarlier) return;
    setIsLoadingEarlier(true);
    try {
      const oldest = messages[messages.length - 1];
      if (!oldest) {
        setHasEarlier(false);
        return;
      }
      const before = new Date(oldest.createdAt as Date).getTime();
      const rows = messageRepository.listBefore({
        conversationId,
        currentUserId,
        before,
        limit: 20,
      });
      if (rows.length === 0) {
        setHasEarlier(false);
        return;
      }
      const older = rows.map((r) => dbMsgToGifted(r, currentUserId));
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => String(m._id)));
        const newItems = older.filter((m) => !existingIds.has(String(m._id)));
        return [...prev, ...newItems];
      });
      setHasEarlier(rows.length === 20);
    } catch (err) {
      console.warn('[useMessagesFromDb] loadEarlier:', (err as Error)?.message);
    } finally {
      if (mountedRef.current) setIsLoadingEarlier(false);
    }
  }, [conversationId, currentUserId, hasEarlier, isLoadingEarlier, messages]);

  // ─── Send message (task 5.3) ───────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
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
        const result = await messagesApi.send(conversationId, {
          content: text,
          type: 'text',
          clientMessageId,
        });
        messageRepository.confirmSend({
          tempId,
          realId: result.message._id,
          clientMessageId,
          serverFields: { content: result.message.content },
        });
      } catch {
        messageRepository.markFailed(tempId);
      }
    },
    [conversationId, currentUserId],
  );

  // ─── Send media message (task 5.3) ────────────────────────────────────────
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

      try {
        const result = await messagesApi.send(conversationId, {
          content,
          type,
          clientMessageId,
          mediaUrl,
          mediaMimeType,
          mediaSize,
          mediaDuration,
        });
        messageRepository.confirmSend({
          tempId,
          realId: result.message._id,
          clientMessageId,
          serverFields: {
            mediaKey: result.message.mediaUrl,
            blurhash: result.message.blurhash,
            imageWidth: result.message.imageWidth,
            imageHeight: result.message.imageHeight,
          },
        });
      } catch {
        messageRepository.markFailed(tempId);
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
        const result = await messagesApi.send(conversationId, {
          content,
          type,
          clientMessageId,
          mediaUrl,
          mediaMimeType,
          mediaSize,
          mediaDuration,
        });
        messageRepository.confirmSend({
          tempId,
          realId: result.message._id,
          clientMessageId,
          serverFields: {
            mediaKey: result.message.mediaUrl,
            blurhash: result.message.blurhash,
            imageWidth: result.message.imageWidth,
            imageHeight: result.message.imageHeight,
          },
        });
      } catch {
        messageRepository.markFailed(tempId);
      }
    },
    [conversationId],
  );

  // ─── Delete message (task 5.3) ────────────────────────────────────────────
  const deleteMessage = useCallback(
    async (messageId: string) => {
      // Optimistic: mark deleted in DB immediately
      messageRepository.applySocketEvent({
        type: 'message_deleted',
        payload: { messageId, conversationId },
      });
      try {
        await messagesApi.deleteMessage(conversationId, messageId);
      } catch (err) {
        console.warn('[useMessagesFromDb] deleteMessage failed:', err);
        // Rollback: re-upsert the original row (best-effort)
        const row = messageRepository.getById(messageId);
        if (row) {
          messageRepository.upsertMany([{ ...row, deleted: false }]);
        }
      }
    },
    [conversationId],
  );

  // ─── React to message (task 5.3) ──────────────────────────────────────────
  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      // Optimistic update via repository
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
      try {
        await messagesApi.toggleReaction(conversationId, messageId, emoji);
      } catch (err) {
        console.warn('[useMessagesFromDb] reactToMessage failed:', err);
      }
    },
    [conversationId, currentUserId],
  );

  // ─── Delete for me (task 5.3) ─────────────────────────────────────────────
  const deleteForMe = useCallback(
    async (messageId: string) => {
      messageRepository.softDeleteForUser(messageId, currentUserId);
      try {
        await messagesApi.deleteForMe(conversationId, messageId);
      } catch (err) {
        console.warn('[useMessagesFromDb] deleteForMe failed:', err);
      }
    },
    [conversationId, currentUserId],
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
    messages,
    sendMessage,
    sendMediaMessage,
    createOptimisticMedia,
    confirmMediaMessage,
    loadEarlier,
    deleteMessage,
    reactToMessage,
    deleteForMe,
    updateUploadProgress,
    isLoadingEarlier,
    isInitialLoading,
    initialLoadError,
    retryInitialLoad,
    hasEarlier,
  };
}
