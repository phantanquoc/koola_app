import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IMessage } from 'react-native-gifted-chat';
import { socketService } from '../../../services/socket/SocketService';
import { conversationsApi } from '../../../services/api/apiService';
import type { Conversation, PinnedMessage } from '../../../types';

interface UsePinManagementArgs {
  conversationId: string;
  conversation: Conversation | null;
  currentUserId: string;
  messages: IMessage[];
}

interface UsePinManagementResult {
  pinnedMessages: PinnedMessage[];
  pinnedMessageIds: string[];
  pinnedContents: Record<string, string>;
  handlePin: (messageId: string) => Promise<void>;
  handleUnpin: (messageId: string) => Promise<void>;
}

export function usePinManagement({
  conversationId,
  conversation,
  currentUserId,
  messages,
}: UsePinManagementArgs): UsePinManagementResult {
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);

  useEffect(() => {
    if (conversation?.pinnedMessages) {
      setPinnedMessages(conversation.pinnedMessages);
    }
  }, [conversation]);

  useEffect(() => {
    const handlePinned = (data: {
      messageId: string;
      conversationId: string;
      pinnedBy: string;
    }) => {
      if (data.conversationId !== conversationId) return;
      setPinnedMessages((prev) => {
        if (prev.some((p) => p.messageId === data.messageId)) return prev;
        return [
          ...prev,
          {
            messageId: data.messageId,
            pinnedBy: data.pinnedBy,
            pinnedAt: new Date().toISOString(),
          },
        ];
      });
    };
    const handleUnpinned = (data: {
      messageId: string;
      conversationId: string;
    }) => {
      if (data.conversationId !== conversationId) return;
      setPinnedMessages((prev) =>
        prev.filter((p) => p.messageId !== data.messageId),
      );
    };

    socketService.on(
      'message_pinned',
      handlePinned as (...args: unknown[]) => void,
    );
    socketService.on(
      'message_unpinned',
      handleUnpinned as (...args: unknown[]) => void,
    );
    return () => {
      socketService.off(
        'message_pinned',
        handlePinned as (...args: unknown[]) => void,
      );
      socketService.off(
        'message_unpinned',
        handleUnpinned as (...args: unknown[]) => void,
      );
    };
  }, [conversationId]);

  const handlePin = useCallback(
    async (messageId: string) => {
      setPinnedMessages((prev) => {
        if (prev.some((p) => p.messageId === messageId)) return prev;
        return [
          ...prev,
          {
            messageId,
            pinnedBy: currentUserId,
            pinnedAt: new Date().toISOString(),
          },
        ];
      });
      try {
        await conversationsApi.pinMessage(conversationId, messageId);
      } catch (err) {
        setPinnedMessages((prev) =>
          prev.filter((p) => p.messageId !== messageId),
        );
        console.warn('[usePinManagement] pinMessage failed:', err);
      }
    },
    [conversationId, currentUserId],
  );

  const handleUnpin = useCallback(
    async (messageId: string) => {
      const snapshot = pinnedMessages;
      setPinnedMessages((prev) =>
        prev.filter((p) => p.messageId !== messageId),
      );
      try {
        await conversationsApi.unpinMessage(conversationId, messageId);
      } catch (err) {
        setPinnedMessages(snapshot);
        console.warn('[usePinManagement] unpinMessage failed:', err);
      }
    },
    [conversationId, pinnedMessages],
  );

  const pinnedMessageIds = useMemo(
    () => pinnedMessages.map((p) => p.messageId),
    [pinnedMessages],
  );

  const pinnedContents = useMemo(() => {
    const map: Record<string, string> = {};
    if (pinnedMessages.length === 0) return map;

    // One pass to index, then O(1) lookups — the previous `messages.find(...)`
    // inside the pin loop rescanned the whole loaded window per pin, so cost was
    // pins x messages and it re-ran on every message-list change (i.e. on every
    // incoming message and every page of history).
    const byId = new Map<string, IMessage>();
    for (const m of messages) {
      const id = String(m._id);
      // First occurrence wins, matching `find`'s semantics exactly. Duplicate
      // ids shouldn't occur, but parity must not depend on that.
      if (!byId.has(id)) byId.set(id, m);
    }

    for (const pin of pinnedMessages) {
      const msg = byId.get(pin.messageId);
      if (msg) map[pin.messageId] = msg.text || '📷 Media';
    }
    return map;
  }, [pinnedMessages, messages]);

  return {
    pinnedMessages,
    pinnedMessageIds,
    pinnedContents,
    handlePin,
    handleUnpin,
  };
}
