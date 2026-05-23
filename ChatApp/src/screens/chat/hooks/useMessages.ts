import { useState, useEffect, useCallback, useRef } from 'react';
import { messagesApi } from '../../../services/api/apiService';
import { socketService } from '../../../services/socket/SocketService';
import type { Message, MessageReaction } from '../../../types';

/** Simple unique ID generator — no crypto dependency */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}
import type { IMessage } from 'react-native-gifted-chat';

/**
 * Convert backend Message to GiftedChat IMessage format
 */
function toGiftedMessage(msg: Message, currentUserId: string): IMessage & Record<string, unknown> {
  // Filter deletedFor on client side as well
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
  };

  // Pass media metadata as custom props — do NOT set image to raw mediaKey
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
    // Set image/video placeholder so GiftedChat calls the correct render slot
    if (msg.type === 'image') {
      base.image = 'media-pending';
    }
    if (msg.type === 'video') {
      base.video = 'media-pending';
    }
  }

  return base;
}

export function useMessages(conversationId: string, currentUserId: string) {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [hasEarlier, setHasEarlier] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const loadingEarlierRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ─── Fetch initial messages ────────────────────────────────────────────────
  const [reloadVersion, setReloadVersion] = useState(0);
  const retryInitialLoad = useCallback(() => {
    setReloadVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsInitialLoading(true);
    setInitialLoadError(null);
    setMessages([]);
    cursorRef.current = null;

    const fetchInitial = async () => {
      try {
        const data = await messagesApi.list(conversationId, undefined, 20);
        if (cancelled) return;
        const filtered = data.messages.filter(
          (m: Message) => !m.deletedFor?.includes(currentUserId),
        );
        const gifted = filtered.map((m: Message) => toGiftedMessage(m, currentUserId));
        gifted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setMessages(gifted);
        setHasEarlier(data.hasMore);
        cursorRef.current = data.nextCursor;
        setInitialLoadError(null);
      } catch (err) {
        const message = (err as Error)?.message || 'Failed to load messages';
        console.warn('[useMessages] fetchInitial:', message);
        if (!cancelled) setInitialLoadError(message);
      } finally {
        if (!cancelled) setIsInitialLoading(false);
      }
    };
    fetchInitial();

    return () => { cancelled = true; };
  }, [conversationId, currentUserId, reloadVersion]);

  // ─── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleNewMessage = (data: { message: Record<string, unknown> }) => {
      const msg = data.message as unknown as Message;
      if (msg.conversationId !== conversationId) return;
      // Skip own messages (already added optimistically)
      if (msg.senderId === currentUserId) return;
      // Deduplicate by _id and clientMessageId (handles temp/real ID race)
      setMessages((prev) => {
        if (prev.find((m) => m._id === msg._id)) return prev;
        const cid = (msg as Message & { clientMessageId?: string }).clientMessageId;
        if (cid && prev.find((m) => (m as IMessage & { clientMessageId?: string }).clientMessageId === cid)) return prev;
        return [toGiftedMessage(msg, currentUserId), ...prev];
      });
    };

    const handleMessageAck = (data: Record<string, unknown>) => {
      const ackData = data as unknown as Message & { messageId: string };
      const clientMessageId = ackData.clientMessageId;
      if (!clientMessageId) return;
      setMessages((prev) =>
        prev.map((m) =>
          (m as IMessage & { clientMessageId?: string }).clientMessageId === clientMessageId
            ? { ...m, _id: ackData.messageId || ackData._id, pending: false }
            : m,
        ),
      );
    };

    const handleMessageDeleted = (data: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m._id !== data.messageId));
    };

    const handleMessageReaction = (data: {
      messageId: string;
      conversationId: string;
      userId: string;
      emoji: string;
      action: 'add' | 'remove';
    }) => {
      if (data.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (String(m._id) !== data.messageId) return m;
          const msg = m as IMessage & Record<string, unknown>;
          const reactions = [...((msg.reactions as MessageReaction[]) || [])];
          if (data.action === 'remove') {
            const idx = reactions.findIndex((r) => r.userId === data.userId && r.emoji === data.emoji);
            if (idx >= 0) reactions.splice(idx, 1);
          } else {
            // Replace existing reaction from this user or add new
            const idx = reactions.findIndex((r) => r.userId === data.userId);
            if (idx >= 0) {
              reactions[idx] = { userId: data.userId, emoji: data.emoji };
            } else {
              reactions.push({ userId: data.userId, emoji: data.emoji });
            }
          }
          return { ...m, reactions } as IMessage;
        }),
      );
    };

    const handleMessageUpdated = (data: {
      messageId: string;
      conversationId: string;
      blurhash?: string;
      imageWidth?: number;
      imageHeight?: number;
    }) => {
      if (data.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (String(m._id) !== data.messageId) return m;
          return {
            ...m,
            blurhash: data.blurhash ?? (m as IMessage & Record<string, unknown>).blurhash,
          } as IMessage;
        }),
      );
    };

    socketService.on('new_message', handleNewMessage as (...args: unknown[]) => void);
    socketService.on('message_ack', handleMessageAck as (...args: unknown[]) => void);
    socketService.on('message_deleted', handleMessageDeleted as (...args: unknown[]) => void);
    socketService.on('message_reaction', handleMessageReaction as (...args: unknown[]) => void);
    socketService.on('message_updated', handleMessageUpdated as (...args: unknown[]) => void);

    return () => {
      socketService.off('new_message', handleNewMessage as (...args: unknown[]) => void);
      socketService.off('message_ack', handleMessageAck as (...args: unknown[]) => void);
      socketService.off('message_deleted', handleMessageDeleted as (...args: unknown[]) => void);
      socketService.off('message_reaction', handleMessageReaction as (...args: unknown[]) => void);
      socketService.off('message_updated', handleMessageUpdated as (...args: unknown[]) => void);
    };
  }, [conversationId, currentUserId]);

  // ─── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const clientMessageId = generateId();
      const tempId = `temp_${clientMessageId}`;

      // Optimistic prepend
      const optimisticMsg: IMessage & { clientMessageId: string } = {
        _id: tempId,
        text,
        createdAt: new Date(),
        user: { _id: currentUserId, name: 'You' },
        pending: true,
        clientMessageId,
      };
      console.log('[useMessages] sendMessage optimistic:', tempId, text);
      setMessages((prev) => [optimisticMsg, ...prev]);

      try {
        console.log('[useMessages] Calling messagesApi.send for:', conversationId);
        const result = await messagesApi.send(conversationId, {
          content: text,
          type: 'text',
          clientMessageId,
        });
        console.log('[useMessages] Send success:', result.message?._id);
        // Replace optimistic with real, and deduplicate if socket already added it
        setMessages((prev) => {
          const realId = result.message._id;
          const withoutDupe = prev.filter((m) => m._id !== realId);
          return withoutDupe.map((m) =>
            m._id === tempId
              ? { ...m, _id: realId, pending: false }
              : m,
          );
        });
      } catch (err) {
        console.log('[useMessages] Send FAILED:', (err as Error)?.message, err);
        // Mark as failed
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId ? { ...m, pending: false, sent: false } : m,
          ),
        );
      }
    },
    [conversationId, currentUserId],
  );

  // ─── Load earlier messages ─────────────────────────────────────────────────
  const loadEarlier = useCallback(async () => {
    if (!hasEarlier || loadingEarlierRef.current) return;
    loadingEarlierRef.current = true;
    setIsLoadingEarlier(true);
    try {
      const data = await messagesApi.list(
        conversationId,
        cursorRef.current || undefined,
        20,
      );
      if (!mountedRef.current) return;
      const gifted = data.messages.map((m: Message) => toGiftedMessage(m, currentUserId));
      gifted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m._id));
        const newItems = gifted.filter((m) => !existingIds.has(m._id));
        return [...prev, ...newItems];
      });
      setHasEarlier(data.hasMore);
      cursorRef.current = data.nextCursor;
    } catch (err) {
      console.warn('[useMessages] loadEarlier:', (err as Error)?.message);
    } finally {
      loadingEarlierRef.current = false;
      if (mountedRef.current) setIsLoadingEarlier(false);
    }
  }, [conversationId, currentUserId, hasEarlier]);

  // ─── Send media message ──────────────────────────────────────────────────
  const sendMediaMessage = useCallback(
    async (mediaUrl: string, mediaMimeType: string, mediaSize: number, type: 'image' | 'file' | 'voice' | 'video', filename?: string, mediaDuration?: number) => {
      const clientMessageId = generateId();
      const tempId = `temp_${clientMessageId}`;
      const content = filename || (type === 'image' ? '📷 Photo' : type === 'voice' ? '🎤 Voice' : type === 'video' ? '🎬 Video' : '📄 File');

      // Optimistic prepend — use placeholder for media, not raw mediaKey
      const optimisticMsg: IMessage & { clientMessageId: string } & Record<string, unknown> = {
        _id: tempId,
        text: (type === 'image' || type === 'video') ? '' : content,
        createdAt: new Date(),
        user: { _id: currentUserId, name: 'You' },
        pending: true,
        clientMessageId,
        mediaKey: mediaUrl,
        mediaMimeType,
        mediaSize,
        mediaDuration,
        mediaType: type,
        image: type === 'image' ? 'media-pending' : undefined,
        video: type === 'video' ? 'media-pending' : undefined,
        isUploading: true,
        uploadProgress: 0,
      };
      setMessages((prev) => [optimisticMsg, ...prev]);

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
        setMessages((prev) => {
          const realId = result.message._id;
          const withoutDupe = prev.filter((m) => m._id !== realId);
          return withoutDupe.map((m) =>
            m._id === tempId
              ? { ...m, _id: realId, pending: false, isUploading: false }
              : m,
          );
        });
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId ? { ...m, pending: false, sent: false } : m,
          ),
        );
      }
    },
    [conversationId, currentUserId],
  );

  // ─── Create optimistic media message ─────────────────────────────────────
  const createOptimisticMedia = useCallback(
    (mediaKey: string, mediaMimeType: string, mediaSize: number, type: 'image' | 'file' | 'voice' | 'video', filename?: string, mediaDuration?: number): string => {
      const clientMessageId = generateId();
      const tempId = `temp_${clientMessageId}`;
      const content = filename || (type === 'image' ? '📷 Photo' : type === 'voice' ? '🎤 Voice' : type === 'video' ? '🎬 Video' : '📄 File');

      const optimisticMsg: IMessage & { clientMessageId: string } & Record<string, unknown> = {
        _id: tempId,
        text: (type === 'image' || type === 'video') ? '' : content,
        createdAt: new Date(),
        user: { _id: currentUserId, name: 'You' },
        pending: true,
        clientMessageId,
        mediaKey,
        mediaMimeType,
        mediaSize,
        mediaDuration,
        mediaType: type,
        image: type === 'image' ? 'media-pending' : undefined,
        video: type === 'video' ? 'media-pending' : undefined,
        isUploading: true,
        uploadProgress: 0,
      };
      setMessages((prev) => [optimisticMsg, ...prev]);
      return tempId;
    },
    [currentUserId],
  );

  // ─── Confirm media message after upload ───────────────────────────────────
  const confirmMediaMessage = useCallback(
    async (tempId: string, mediaUrl: string, mediaMimeType: string, mediaSize: number, type: 'image' | 'file' | 'voice' | 'video', filename?: string, mediaDuration?: number) => {
      const clientMessageId = tempId.replace('temp_', '');
      const content = filename || (type === 'image' ? '📷 Photo' : type === 'voice' ? '🎤 Voice' : type === 'video' ? '🎬 Video' : '📄 File');

      // Mark as no longer uploading
      setMessages((prev) =>
        prev.map((m) =>
          m._id === tempId ? { ...m, isUploading: false, mediaKey: mediaUrl } as IMessage : m,
        ),
      );

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
        setMessages((prev) => {
          const realId = result.message._id;
          const withoutDupe = prev.filter((m) => m._id !== realId);
          return withoutDupe.map((m) =>
            m._id === tempId
              ? { ...m, _id: realId, pending: false, isUploading: false }
              : m,
          );
        });
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId ? { ...m, pending: false, sent: false, isUploading: false } : m,
          ),
        );
      }
    },
    [conversationId],
  );

  // ─── Delete message ────────────────────────────────────────────────────────
  const deleteMessage = useCallback(
    async (messageId: string) => {
      let removedMsg: IMessage | undefined;
      let removedIndex = -1;
      setMessages((prev) => {
        removedIndex = prev.findIndex((m) => m._id === messageId);
        if (removedIndex >= 0) removedMsg = prev[removedIndex];
        return prev.filter((m) => m._id !== messageId);
      });
      try {
        await messagesApi.deleteMessage(conversationId, messageId);
      } catch {
        // Rollback: restore the message at its original position
        if (removedMsg) {
          setMessages((prev) => {
            const restored = [...prev];
            restored.splice(removedIndex, 0, removedMsg!);
            return restored;
          });
        }
      }
    },
    [conversationId],
  );

  // ─── React to message ─────────────────────────────────────────────────────
  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => {
          if (String(m._id) !== messageId) return m;
          const msg = m as IMessage & Record<string, unknown>;
          const reactions = [...((msg.reactions as MessageReaction[]) || [])];
          const existingIdx = reactions.findIndex((r) => r.userId === currentUserId);
          if (existingIdx >= 0 && reactions[existingIdx].emoji === emoji) {
            reactions.splice(existingIdx, 1);
          } else if (existingIdx >= 0) {
            reactions[existingIdx] = { userId: currentUserId, emoji };
          } else {
            reactions.push({ userId: currentUserId, emoji });
          }
          return { ...m, reactions } as IMessage;
        }),
      );
      try {
        await messagesApi.toggleReaction(conversationId, messageId, emoji);
      } catch {
        // Could revert optimistic update but API react is idempotent
      }
    },
    [conversationId, currentUserId],
  );

  // ─── Delete for me ────────────────────────────────────────────────────────
  const deleteForMe = useCallback(
    async (messageId: string) => {
      let removedMsg: IMessage | undefined;
      let removedIndex = -1;
      setMessages((prev) => {
        removedIndex = prev.findIndex((m) => String(m._id) === messageId);
        if (removedIndex >= 0) removedMsg = prev[removedIndex];
        return prev.filter((m) => String(m._id) !== messageId);
      });
      try {
        await messagesApi.deleteForMe(conversationId, messageId);
      } catch {
        if (removedMsg) {
          setMessages((prev) => {
            const restored = [...prev];
            restored.splice(removedIndex, 0, removedMsg!);
            return restored;
          });
        }
      }
    },
    [conversationId],
  );

  // ─── Update upload progress on optimistic message ──────────────────────────
  const updateUploadProgress = useCallback(
    (tempId: string, progress: number) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === tempId ? { ...m, uploadProgress: progress } as IMessage : m,
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
