import { useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '../../../services/socket/SocketService';

interface UseTypingIndicatorOptions {
  conversationId: string;
}

interface UseTypingIndicatorResult {
  typingUserIds: string[];
  emitTyping: (text: string) => void;
  stopTyping: () => void;
}

const TYPING_TIMEOUT_MS = 3000;
const EMIT_DEBOUNCE_MS = 500;

export function useTypingIndicator({
  conversationId,
}: UseTypingIndicatorOptions): UseTypingIndicatorResult {
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const emitDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleTyping = (payload: {
      conversationId: string;
      userId: string;
      isTyping: boolean;
    }) => {
      if (payload.conversationId !== conversationId) return;

      if (payload.isTyping) {
        setTypingUserIds((prev) =>
          prev.includes(payload.userId) ? prev : [...prev, payload.userId],
        );
        // Auto-remove after timeout
        const existing = typingTimers.current.get(payload.userId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          setTypingUserIds((prev) => prev.filter((id) => id !== payload.userId));
          typingTimers.current.delete(payload.userId);
        }, TYPING_TIMEOUT_MS);
        typingTimers.current.set(payload.userId, timer);
      } else {
        setTypingUserIds((prev) => prev.filter((id) => id !== payload.userId));
        const t = typingTimers.current.get(payload.userId);
        if (t) {
          clearTimeout(t);
          typingTimers.current.delete(payload.userId);
        }
      }
    };

    socketService.on('user_typing', handleTyping);
    return () => {
      socketService.off('user_typing', handleTyping);
      typingTimers.current.forEach((t) => clearTimeout(t));
    };
  }, [conversationId]);

  const emitTyping = useCallback(
    (text: string) => {
      if (!text.trim()) {
        socketService.emit('typing_stop', { conversationId });
        return;
      }
      if (emitDebounceTimer.current) return; // already scheduled
      emitDebounceTimer.current = setTimeout(() => {
        socketService.emit('typing_start', { conversationId });
        emitDebounceTimer.current = null;
      }, EMIT_DEBOUNCE_MS);
    },
    [conversationId],
  );

  const stopTyping = useCallback(() => {
    if (emitDebounceTimer.current) {
      clearTimeout(emitDebounceTimer.current);
      emitDebounceTimer.current = null;
    }
    socketService.emit('typing_stop', { conversationId });
  }, [conversationId]);

  return { typingUserIds, emitTyping, stopTyping };
}
