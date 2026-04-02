import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { messagesApi } from '../../../services/api/apiService';
import { socketService } from '../../../services/socket/socketService';
import type { Message } from '../../../types';
import type { IMessage } from 'react-native-gifted-chat';

/**
 * Convert backend Message to GiftedChat IMessage format
 */
function toGiftedMessage(msg: Message, currentUserId: string): IMessage {
  return {
    _id: msg._id,
    text: msg.deleted ? 'This message was deleted' : msg.content,
    createdAt: new Date(msg.createdAt),
    user: {
      _id: msg.senderId,
      name: msg.senderId === currentUserId ? 'You' : undefined,
    },
    image: msg.type === 'image' && msg.mediaUrl ? msg.mediaUrl : undefined,
    system: msg.type === 'system',
  };
}

export function useMessages(conversationId: string, currentUserId: string) {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(true);
  const cursorRef = useRef<string | null>(null);

  // ─── Fetch initial messages ────────────────────────────────────────────────
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const data = await messagesApi.list(conversationId, undefined, 20);
        const gifted = data.messages.map((m: Message) => toGiftedMessage(m, currentUserId));
        setMessages(gifted);
        setHasEarlier(data.hasMore);
        cursorRef.current = data.nextCursor;
      } catch (err) {
        console.error('[useMessages] fetchInitial error:', err);
      }
    };
    fetchInitial();
  }, [conversationId, currentUserId]);

  // ─── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleNewMessage = (data: { message: Record<string, unknown> }) => {
      const msg = data.message as unknown as Message;
      if (msg.conversationId !== conversationId) return;
      // Deduplicate
      setMessages((prev) => {
        if (prev.find((m) => m._id === msg._id)) return prev;
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

    socketService.on('new_message', handleNewMessage as (...args: unknown[]) => void);
    socketService.on('message_ack', handleMessageAck as (...args: unknown[]) => void);
    socketService.on('message_deleted', handleMessageDeleted as (...args: unknown[]) => void);

    return () => {
      socketService.off('new_message', handleNewMessage as (...args: unknown[]) => void);
      socketService.off('message_ack', handleMessageAck as (...args: unknown[]) => void);
      socketService.off('message_deleted', handleMessageDeleted as (...args: unknown[]) => void);
    };
  }, [conversationId, currentUserId]);

  // ─── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const clientMessageId = uuidv4();
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
      setMessages((prev) => [optimisticMsg, ...prev]);

      try {
        const result = await messagesApi.send(conversationId, {
          content: text,
          type: 'text',
          clientMessageId,
        });
        // Replace optimistic with real
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId
              ? { ...m, _id: result.message._id, pending: false }
              : m,
          ),
        );
      } catch {
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
    if (!hasEarlier || isLoadingEarlier) return;
    setIsLoadingEarlier(true);
    try {
      const data = await messagesApi.list(
        conversationId,
        cursorRef.current || undefined,
        20,
      );
      const gifted = data.messages.map((m: Message) => toGiftedMessage(m, currentUserId));
      setMessages((prev) => [...prev, ...gifted]);
      setHasEarlier(data.hasMore);
      cursorRef.current = data.nextCursor;
    } catch (err) {
      console.error('[useMessages] loadEarlier error:', err);
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [conversationId, currentUserId, hasEarlier, isLoadingEarlier]);

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
    loadEarlier,
    deleteMessage,
    isLoadingEarlier,
    hasEarlier,
  };
}
