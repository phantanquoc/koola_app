import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import NetInfo from '@react-native-community/netinfo';
import { messagesApi } from '../../../services/api/apiService';
import { socketService } from '../../../services/socket/SocketService';
import { offlineQueueService } from '../../../services/OfflineQueueService';
import type { Message } from '../../../types';

export interface GiftedMessage {
  _id: string | number;
  text: string;
  createdAt: Date;
  user: { _id: string; name?: string; avatar?: string };
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  image?: string;
  type?: 'text' | 'image' | 'file' | 'system';
  clientMessageId?: string;
}

interface UseMessagesOptions {
  conversationId: string;
  currentUserId: string;
}

function toGifted(msg: Message): GiftedMessage {
  return {
    _id: msg._id,
    text: msg.content,
    createdAt: new Date(msg.createdAt),
    user: {
      _id: msg.senderId,
      name: msg.sender?.displayName,
      avatar: msg.sender?.avatar,
    },
    status: msg.status,
    image: msg.type === 'image' ? msg.mediaUrl : undefined,
    type: (msg.type === 'voice' ? 'text' : msg.type) as GiftedMessage['type'],
  };
}

export function useMessages({ conversationId, currentUserId }: UseMessagesOptions) {
  const [messages, setMessages] = useState<GiftedMessage[]>([]);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(true);
  const cursorRef = useRef<string | undefined>(undefined);

  const fetchMessages = useCallback(
    async (cursor?: string) => {
      try {
        const res = await messagesApi.list(conversationId, cursor, 20);
        const items: Message[] = (res.data as any).items ?? [];
        const gifted = items.reverse().map(toGifted);

        if (cursor) {
          setMessages((prev) => {
            const merged = [...gifted, ...prev];
            return merged;
          });
        } else {
          setMessages(gifted);
        }

        if (items.length > 0) {
          cursorRef.current = items[items.length - 1]._id;
        }
        setHasEarlier((res.data as any).hasMore ?? false);
      } catch {
        // silent
      }
    },
    [conversationId],
  );

  // Initial load
  useEffect(() => {
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Socket listeners
  useEffect(() => {
    const handleNewMessage = (payload: { message: Message }) => {
      if (payload.message.conversationId !== conversationId) return;
      setMessages((prev) => {
        const alreadyExists = prev.some(
          (m) => String(m._id) === String(payload.message._id),
        );
        if (alreadyExists) return prev;
        return [toGifted(payload.message), ...prev];
      });
    };

    const handleMessageAck = (payload: any) => {
      const tempId = payload.clientMessageId ?? payload.message?._id;
      if (!tempId) return;
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === String(tempId)
            ? { ...m, _id: payload.message?._id ?? tempId, status: 'sent' as const }
            : m,
        ),
      );
    };

    const handleMessageDeleted = (payload: { messageId: string }) => {
      setMessages((prev) =>
        prev.filter((m) => String(m._id) !== String(payload.messageId)),
      );
    };

    socketService.on('new_message', handleNewMessage);
    socketService.on('message_ack', handleMessageAck);
    socketService.on('message_deleted', handleMessageDeleted);

    return () => {
      socketService.off('new_message', handleNewMessage);
      socketService.off('message_ack', handleMessageAck);
      socketService.off('message_deleted', handleMessageDeleted);
    };
  }, [conversationId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const clientMessageId = uuidv4();
      const tempId = `temp_${clientMessageId}`;

      const optimisticMsg: GiftedMessage = {
        _id: tempId,
        text: trimmed,
        createdAt: new Date(),
        user: { _id: currentUserId },
        status: 'sending',
        clientMessageId,
      };

      setMessages((prev) => [...prev, optimisticMsg]);

      // Check connectivity
      const state = await NetInfo.fetch();
      const isConnected = state.isConnected === true;

      if (isConnected) {
        // Online: send directly via API
        try {
          await messagesApi.send(conversationId, {
            type: 'text',
            content: trimmed,
            clientMessageId,
          });
          // ACK will arrive via socket → handleMessageAck updates status to 'sent'
        } catch {
          setMessages((prev) =>
            prev.map((m) =>
              String(m._id) === tempId ? { ...m, status: 'failed' as const } : m,
            ),
          );
        }
      } else {
        // Offline: add to queue for retry when back online
        // Status stays 'sending' until queue processes it (ACK from socket) or fails
        await offlineQueueService.add({
          id: clientMessageId,
          conversationId,
          content: trimmed,
          type: 'text',
          createdAt: new Date().toISOString(),
          tempId,
        });
        // Queue will retry on reconnect; message_ack from socket will update status to 'sent'
        // If queue fails after max retries, ChatScreen's queue watcher marks it 'failed'
      }
    },
    [conversationId, currentUserId],
  );

  const loadEarlier = useCallback(async () => {
    if (isLoadingEarlier || !hasEarlier) return;
    setIsLoadingEarlier(true);
    await fetchMessages(cursorRef.current);
    setIsLoadingEarlier(false);
  }, [isLoadingEarlier, hasEarlier, fetchMessages]);

  const deleteMessage = useCallback(
    async (messageId: string) => {
      setMessages((prev) =>
        prev.filter((m) => String(m._id) !== String(messageId)),
      );
      try {
        await messagesApi.delete(conversationId, messageId);
      } catch {
        // silent
      }
    },
    [conversationId],
  );

  const prependMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      const alreadyExists = prev.some(
        (m) => String(m._id) === String(msg._id),
      );
      if (alreadyExists) return prev;
      return [toGifted(msg), ...prev];
    });
  }, []);

  const replaceMessage = useCallback(
    (tempId: string, serverMsg: Message) => {
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === tempId ? toGifted(serverMsg) : m,
        ),
      );
    },
    [],
  );

  const updateMessageStatus = useCallback(
    (messageId: string, status: GiftedMessage['status']) => {
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === messageId ? { ...m, status } : m,
        ),
      );
    },
    [],
  );

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.filter((m) => String(m._id) !== String(messageId)),
    );
  }, []);

  return {
    messages,
    isLoadingEarlier,
    hasEarlier,
    sendMessage,
    loadEarlier,
    deleteMessage,
    prependMessage,
    replaceMessage,
    updateMessageStatus,
    removeMessage,
  };
}
