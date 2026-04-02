import { useState, useEffect, useCallback, useRef } from 'react';
import { socketService } from '../../../services/socket/socketService';

export function useTypingIndicator(conversationId: string) {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastEmitRef = useRef<number>(0);

  // ─── Listen for typing events ──────────────────────────────────────────────
  useEffect(() => {
    const handleUserTyping = (data: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (data.conversationId !== conversationId) return;

      if (data.isTyping) {
        setTypingUsers((prev) =>
          prev.includes(data.userId) ? prev : [...prev, data.userId],
        );

        // Auto-remove after 3 seconds
        const existingTimeout = typingTimeoutsRef.current.get(data.userId);
        if (existingTimeout) clearTimeout(existingTimeout);

        const timeout = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((id) => id !== data.userId));
          typingTimeoutsRef.current.delete(data.userId);
        }, 3000);
        typingTimeoutsRef.current.set(data.userId, timeout);
      } else {
        setTypingUsers((prev) => prev.filter((id) => id !== data.userId));
        const existingTimeout = typingTimeoutsRef.current.get(data.userId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          typingTimeoutsRef.current.delete(data.userId);
        }
      }
    };

    socketService.on('user_typing', handleUserTyping as (...args: unknown[]) => void);

    return () => {
      socketService.off('user_typing', handleUserTyping as (...args: unknown[]) => void);
      // Clear all timeouts
      typingTimeoutsRef.current.forEach((t) => clearTimeout(t));
      typingTimeoutsRef.current.clear();
    };
  }, [conversationId]);

  // ─── Emit typing ───────────────────────────────────────────────────────────
  const emitTyping = useCallback(
    (text: string) => {
      const now = Date.now();
      if (text.length > 0 && now - lastEmitRef.current > 500) {
        socketService.emit('typing_start', { conversationId });
        lastEmitRef.current = now;
      } else if (text.length === 0) {
        socketService.emit('typing_stop', { conversationId });
      }
    },
    [conversationId],
  );

  return { typingUsers, emitTyping };
}
