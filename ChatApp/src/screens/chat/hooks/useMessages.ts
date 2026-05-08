import { useState, useEffect, useCallback, useRef } from 'react';
import { messagesApi } from '../../../services/api/apiService';
import { socketService } from '../../../services/socket/socketService';
import { uploadMedia } from '../../../services/media/mediaUploadService';
import { generateClientId } from '../../../utils/clientId';
import type { Message, MessageType } from '../../../types';
import type { IMessage } from 'react-native-gifted-chat';

/**
 * Convert backend Message to GiftedChat IMessage format.
 *
 * For media messages we stash the raw domain fields (mediaKey, type, size,
 * duration) under non-standard IMessage props so custom renderers in
 * ChatScreen can pick them up without re-fetching.
 */
function toGiftedMessage(msg: Message, currentUserId: string): IMessage {
  const base: IMessage & {
    messageType?: MessageType;
    mediaKey?: string;
    mediaMimeType?: string;
    mediaSize?: number;
    mediaDuration?: number;
  } = {
    _id: msg._id,
    text: msg.deleted ? 'This message was deleted' : msg.content,
    createdAt: new Date(msg.createdAt),
    user: {
      _id: msg.senderId,
      name: msg.senderId === currentUserId ? 'You' : undefined,
    },
    system: msg.type === 'system',
    messageType: msg.type,
    mediaKey: msg.mediaUrl || undefined,
    mediaMimeType: msg.mediaMimeType || undefined,
    mediaSize: msg.mediaSize || undefined,
    mediaDuration: msg.mediaDuration || undefined,
  };
  // Mark GiftedChat's image/video slots so the library recognizes media bubbles.
  if (msg.type === 'image' && msg.mediaUrl) {
    base.image = msg.mediaUrl;
  }
  if (msg.type === 'video' && msg.mediaUrl) {
    base.video = msg.mediaUrl;
  }
  return base;
}

export function useMessages(conversationId: string, currentUserId: string) {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(true);
  const cursorRef = useRef<string | null>(null);

  /**
   * GiftedChat expects messages sorted newest-first (index 0 = newest) because
   * it renders into an inverted FlatList. We guarantee that ordering after
   * every mutation so that socket arrivals, optimistic sends, and paginated
   * loads stay chronological regardless of insertion order.
   *
   * Tie-breaker: when two messages share the same createdAt timestamp (common
   * for bulk imports or high-throughput sends), fall back to the Mongo
   * ObjectId, whose leading 4 bytes are a second-resolution timestamp and
   * whose trailing bytes make the ID strictly increasing per-process.
   *
   * Also dedupes on `_id` to survive the case where a socket event races the
   * POST response, or where fetchInitial + loadEarlier overlap and return
   * overlapping cursors. Deduping here is cheap (Map build + iteration) and
   * makes every setMessages call idempotent — crucial for React's list diff
   * to stop emitting "two children with the same key" warnings.
   */
  const sortDesc = useCallback((arr: IMessage[]): IMessage[] => {
    const seen = new Map<string, IMessage>();
    for (const m of arr) {
      const key = String(m._id);
      // Prefer the entry that is NOT pending (server-confirmed wins over
      // optimistic) when both share an _id.
      const existing = seen.get(key);
      if (!existing || existing.pending) {
        seen.set(key, m);
      }
    }
    return Array.from(seen.values()).sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      if (tb !== ta) return tb - ta;
      return String(b._id).localeCompare(String(a._id));
    });
  }, []);

  // ─── Fetch initial messages ────────────────────────────────────────────────
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const data = await messagesApi.list(conversationId, undefined, 20);
        const gifted = data.messages.map((m: Message) => toGiftedMessage(m, currentUserId));
        setMessages(sortDesc(gifted));
        setHasEarlier(data.hasMore);
        cursorRef.current = data.nextCursor;
      } catch (err) {
        console.error('[useMessages] fetchInitial error:', err);
      }
    };
    fetchInitial();
  }, [conversationId, currentUserId, sortDesc]);

  // ─── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleNewMessage = (data: { message: Record<string, unknown> }) => {
      const msg = data.message as unknown as Message;
      if (msg.conversationId !== conversationId) return;
      // Deduplicate — a message may arrive via socket while the optimistic
      // placeholder (tempId) is still in state. Match by clientMessageId first,
      // then by real _id.
      setMessages((prev) => {
        const byRealId = prev.findIndex((m) => m._id === msg._id);
        if (byRealId !== -1) return prev;
        const byClientId = prev.findIndex(
          (m) =>
            (m as IMessage & { clientMessageId?: string }).clientMessageId ===
              msg.clientMessageId && msg.clientMessageId,
        );
        if (byClientId !== -1) {
          // Replace optimistic in place, then re-sort.
          const next = [...prev];
          next[byClientId] = toGiftedMessage(msg, currentUserId);
          return sortDesc(next);
        }
        return sortDesc([toGiftedMessage(msg, currentUserId), ...prev]);
      });
    };

    const handleMessageAck = (data: Record<string, unknown>) => {
      const ackData = data as unknown as Message & { messageId: string };
      const clientMessageId = ackData.clientMessageId;
      if (!clientMessageId) return;
      setMessages((prev) =>
        sortDesc(
          prev.map((m) =>
            (m as IMessage & { clientMessageId?: string }).clientMessageId === clientMessageId
              ? { ...m, _id: ackData.messageId || ackData._id, pending: false }
              : m,
          ),
        ),
      );
    };

    const handleMessageDeleted = (data: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m._id !== data.messageId));
    };

    socketService.on('new_message', handleNewMessage as (...args: unknown[]) => void);
    socketService.on('message_ack', handleMessageAck as (...args: unknown[]) => void);
    socketService.on('message_deleted', handleMessageDeleted as (...args: unknown[]) => void);

    return () => {
      socketService.off('new_message', handleNewMessage as (...args: unknown[]) => void);
      socketService.off('message_ack', handleMessageAck as (...args: unknown[]) => void);
      socketService.off('message_deleted', handleMessageDeleted as (...args: unknown[]) => void);
    };
  }, [conversationId, currentUserId, sortDesc]);

  // ─── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const clientMessageId = generateClientId();
      const tempId = `temp_${clientMessageId}`;
      console.log('[useMessages] sendMessage:', { clientMessageId, text });

      // Optimistic prepend
      const optimisticMsg: IMessage & { clientMessageId: string } = {
        _id: tempId,
        text,
        createdAt: new Date(),
        user: { _id: currentUserId, name: 'You' },
        pending: true,
        clientMessageId,
      };
      setMessages((prev) => sortDesc([optimisticMsg, ...prev]));

      try {
        const result = await messagesApi.send(conversationId, {
          content: text,
          type: 'text',
          clientMessageId,
        });
        console.log('[useMessages] sendMessage: POST success', result.message?._id);
        // Replace optimistic with real
        setMessages((prev) =>
          sortDesc(
            prev.map((m) =>
              m._id === tempId
                ? { ...m, _id: result.message._id, pending: false }
                : m,
            ),
          ),
        );
      } catch (err) {
        console.error('[useMessages] sendMessage: POST failed', err);
        // Mark as failed
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId ? { ...m, pending: false, sent: false } : m,
          ),
        );
      }
    },
    [conversationId, currentUserId, sortDesc],
  );

  // ─── Send media message (image/video/file) ────────────────────────────────
  const sendMediaMessage = useCallback(
    async (params: {
      fileUri: string;
      filename: string;
      mimeType: string;
      size: number;
      type: 'image' | 'video' | 'file';
      duration?: number;
    }) => {
      const clientMessageId = generateClientId();
      const tempId = `temp_${clientMessageId}`;

      // Optimistic prepend — show local URI while uploading
      const optimisticMsg: IMessage & {
        clientMessageId: string;
        messageType: MessageType;
        mediaMimeType?: string;
        mediaSize?: number;
        mediaDuration?: number;
        isUploading?: boolean;
      } = {
        _id: tempId,
        text: '',
        createdAt: new Date(),
        user: { _id: currentUserId, name: 'You' },
        pending: true,
        clientMessageId,
        messageType: params.type,
        mediaMimeType: params.mimeType,
        mediaSize: params.size,
        mediaDuration: params.duration,
        isUploading: true,
        ...(params.type === 'image' ? { image: params.fileUri } : {}),
        ...(params.type === 'video' ? { video: params.fileUri } : {}),
      };
      setMessages((prev) => sortDesc([optimisticMsg, ...prev]));

      try {
        console.log('[useMessages] sendMediaMessage: requesting presigned URL', {
          filename: params.filename,
          mimeType: params.mimeType,
          size: params.size,
        });
        // 1. Upload to MinIO via presigned URL
        const uploaded = await uploadMedia(
          params.fileUri,
          params.filename,
          params.mimeType,
          params.size,
          conversationId,
        );
        console.log('[useMessages] sendMediaMessage: uploaded', uploaded.mediaKey);

        // 2. Persist message via REST (backend fans out via socket).
        // NOTE: omit `content` entirely for media messages — sending an empty
        // string here would fail the @IsNotEmpty() validator on
        // SendMessageDto.content, yielding a 400 "content is required".
        const result = await messagesApi.send(conversationId, {
          type: params.type,
          mediaUrl: uploaded.mediaKey,
          mediaMimeType: params.mimeType,
          mediaSize: params.size,
          mediaDuration: params.duration,
          clientMessageId,
        });
        console.log('[useMessages] sendMediaMessage: posted message', result.message?._id);

        // 3. Replace optimistic with real
        setMessages((prev) =>
          sortDesc(
            prev.map((m) =>
              m._id === tempId
                ? toGiftedMessage(result.message as Message, currentUserId)
                : m,
            ),
          ),
        );
      } catch (err) {
        console.error('[useMessages] sendMediaMessage error:', err);
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId ? { ...m, pending: false, sent: false } : m,
          ),
        );
      }
    },
    [conversationId, currentUserId, sortDesc],
  );

  // ─── Load earlier messages ─────────────────────────────────────────────────
  const loadEarlier = useCallback(async () => {
    if (!hasEarlier || isLoadingEarlier) return;
    setIsLoadingEarlier(true);
    try {
      const data = await messagesApi.list(
        conversationId,
        cursorRef.current || undefined,
        20,
      );
      const gifted = data.messages.map((m: Message) => toGiftedMessage(m, currentUserId));
      setMessages((prev) => sortDesc([...prev, ...gifted]));
      setHasEarlier(data.hasMore);
      cursorRef.current = data.nextCursor;
    } catch (err) {
      console.error('[useMessages] loadEarlier error:', err);
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [conversationId, currentUserId, hasEarlier, isLoadingEarlier, sortDesc]);

  // ─── Delete message ────────────────────────────────────────────────────────
  const deleteMessage = useCallback(
    async (messageId: string) => {
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
      try {
        await messagesApi.deleteMessage(conversationId, messageId);
      } catch {
        // Re-fetch to restore if delete failed
      }
    },
    [conversationId],
  );

  return {
    messages,
    sendMessage,
    sendMediaMessage,
    loadEarlier,
    deleteMessage,
    isLoadingEarlier,
    hasEarlier,
  };
}
