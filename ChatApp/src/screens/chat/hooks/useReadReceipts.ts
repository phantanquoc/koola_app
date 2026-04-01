import { useCallback, useEffect, useRef } from 'react';
import { socketService } from '../../../services/socket/SocketService';
import type { GiftedMessage } from './useMessages';

interface UseReadReceiptsOptions {
  conversationId: string;
  messages: GiftedMessage[];
}

const MARK_READ_DEBOUNCE_MS = 500;

export function useReadReceipts({ conversationId, messages }: UseReadReceiptsOptions) {
  const lastReadMessageId = useRef<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleMessageRead = (payload: { messageId: string; readBy: string }) => {
      // Update all messages from this reader
      // (handled by updating status in useMessages via message_ack)
    };

    socketService.on('message_read', handleMessageRead);
    return () => {
      socketService.off('message_read', handleMessageRead);
    };
  }, []);

  const markRead = useCallback(
    (messageId: string) => {
      if (lastReadMessageId.current === messageId) return; // already marked
      lastReadMessageId.current = messageId;

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        socketService.emit('mark_read', { conversationId, messageId });
        debounceTimer.current = null;
      }, MARK_READ_DEBOUNCE_MS);
    },
    [conversationId],
  );

  // Called from FlatList scroll — mark the last visible message from another user
  const markLastVisibleMessageRead = useCallback(
    (visibleMessages: GiftedMessage[]) => {
      if (visibleMessages.length === 0) return;
      const lastMsg = visibleMessages[visibleMessages.length - 1];
      if (lastMsg?.user?._id !== 'system') {
        markRead(String(lastMsg._id));
      }
    },
    [markRead],
  );

  return { markLastVisibleMessageRead };
}
