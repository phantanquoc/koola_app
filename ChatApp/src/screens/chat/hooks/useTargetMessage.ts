import { useState, useEffect, useRef, useCallback } from 'react';
import { messagesApi } from '../../../services/api/apiService';
import { useKoolaToast } from '../../../ui';
import type { Message } from '../../../types';
import type { IMessage } from 'react-native-gifted-chat';

/**
 * Convert raw Message to GiftedChat format (duplicated from useMessages for
 * isolation — this hook is self-contained and does not share state with the
 * main useMessages hook).
 */
function toGiftedMessageForAround(msg: Message, currentUserId: string): IMessage & Record<string, unknown> {
  const base: IMessage & Record<string, unknown> = {
    _id: msg._id,
    text: msg.deleted ? 'This message was deleted' : ((msg.type === 'image' || msg.type === 'video') ? '' : msg.content),
    createdAt: new Date(msg.createdAt),
    user: {
      _id: msg.senderId,
      name: msg.senderId === currentUserId ? 'You' : undefined,
    },
    system: msg.type === 'system',
    reactions: msg.reactions || [],
    pending: msg.status === 'sending',
    sent: msg.status !== 'failed',
    failed: msg.status === 'failed',
    readBy: msg.readBy ?? [],
    messageStatus: msg.status ?? 'sent',
  };

  if ((msg.type === 'image' || msg.type === 'file' || msg.type === 'video') && msg.mediaUrl) {
    base.mediaKey = msg.mediaUrl;
    base.mediaMimeType = msg.mediaMimeType;
    base.mediaSize = msg.mediaSize;
    base.mediaDuration = (msg as Message & { mediaDuration?: number }).mediaDuration;
    base.mediaType = msg.type;
    base.blurhash = (msg as Message & { blurhash?: string }).blurhash || null;
    base.imageWidth = (msg as Message & { imageWidth?: number | null }).imageWidth ?? undefined;
    base.imageHeight = (msg as Message & { imageHeight?: number | null }).imageHeight ?? undefined;
    base.mediaThumbnailKey = msg.mediaThumbnailKey ?? null;
    if (msg.type === 'image') base.image = 'media-pending';
    if (msg.type === 'video') base.video = 'media-pending';
  }

  return base;
}

export interface TargetMessageState {
  /** Messages loaded around the target (GiftedChat format, newest first) */
  contextMessages: (IMessage & Record<string, unknown>)[] | null;
  /** Target message ID for highlight */
  highlightId: string | null;
  /** Whether the around query is in progress */
  isLoading: boolean;
  /** Error message if the target couldn't be loaded (fallback to normal mode) */
  error: string | null;
  /** Whether more messages exist before the loaded context */
  hasBefore: boolean;
  /** Whether more messages exist after the loaded context */
  hasAfter: boolean;
  /** Clear highlight after animation */
  clearHighlight: () => void;
  /** Exit the snapshot and return to the live message list */
  clearContextMessages: () => void;
}

/**
 * Hook that fetches a context window around a target message and prepares
 * it for scroll-to + highlight. When targetMessageId is undefined or null,
 * this hook is a no-op (returns null state).
 */
export function useTargetMessage(
  conversationId: string,
  currentUserId: string,
  targetMessageId?: string,
): TargetMessageState {
  const [contextMessages, setContextMessages] = useState<(IMessage & Record<string, unknown>)[] | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasBefore, setHasBefore] = useState(false);
  const [hasAfter, setHasAfter] = useState(false);
  const fetchedRef = useRef<string | null>(null);
  const { show: showToast } = useKoolaToast();

  useEffect(() => {
    if (!targetMessageId) return;
    // Don't re-fetch if we already loaded this target
    if (fetchedRef.current === targetMessageId) return;
    fetchedRef.current = targetMessageId;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    messagesApi
      .getMessagesAround(conversationId, targetMessageId, 30)
      .then((res) => {
        if (cancelled) return;
        const filtered = res.messages.filter(
          (m: Message) => !m.deletedFor?.includes(currentUserId),
        );
        const gifted = filtered.map((m: Message) =>
          toGiftedMessageForAround(m, currentUserId),
        );
        // GiftedChat expects newest-first
        gifted.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setContextMessages(gifted);
        setHighlightId(targetMessageId);
        setHasBefore(res.hasBefore);
        setHasAfter(res.hasAfter);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Không thể tải tin nhắn đã chọn');
        setContextMessages(null);
        showToast('Không tìm thấy tin nhắn', 'warning');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, currentUserId, targetMessageId]);

  const clearHighlight = useCallback(() => {
    setHighlightId(null);
  }, []);

  const clearContextMessages = useCallback(() => {
    setContextMessages(null);
    setHighlightId(null);
    setHasBefore(false);
    setHasAfter(false);
  }, []);

  return {
    contextMessages,
    highlightId,
    isLoading,
    error,
    hasBefore,
    hasAfter,
    clearHighlight,
    clearContextMessages,
  };
}
