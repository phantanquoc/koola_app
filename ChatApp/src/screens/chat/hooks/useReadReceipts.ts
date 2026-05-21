import { useEffect, useRef, useCallback } from 'react';
import { socketService } from '../../../services/socket/SocketService';
import type { IMessage } from 'react-native-gifted-chat';

export function useReadReceipts(
  conversationId: string,
  messages: IMessage[],
  currentUserId: string,
) {
  const lastReadRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Mark read ─────────────────────────────────────────────────────────────
  const markRead = useCallback(
    (messageId: string) => {
      if (messageId === lastReadRef.current) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        socketService.emit('mark_read', { conversationId, messageId });
        lastReadRef.current = messageId;
      }, 500);
    },
    [conversationId],
  );

  // ─── Auto-mark first visible message as read ──────────────────────────────
  useEffect(() => {
    if (messages.length === 0) return;

    // Find the most recent message not from current user
    const firstUnread = messages.find(
      (m) => m.user._id !== currentUserId && !m.system,
    );
    if (firstUnread && String(firstUnread._id) !== lastReadRef.current) {
      markRead(firstUnread._id as string);
    }
  }, [messages, currentUserId, markRead]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return { markRead };
}
