/**
 * useMessageSync — fetches missed messages on reconnect and merges them with local state.
 *
 * Calls `GET /messages/sync?since=lastSyncAt` to recover messages received while offline.
 * Handles pagination, deduplication against existing messages, and persists lastSyncAt.
 */
import { useCallback, useState } from 'react';
import { storage } from '../utils/asyncStorage';
import { messagesApi } from '../services/api/apiService';
import type { Message } from '../types';

export interface UseMessageSyncReturn {
  /**
   * Fetch and sync missed messages from the server.
   * @param existingMessages — current local messages for deduplication
   * @returns all messages (existing + new, deduplicated), newest first
   */
  sync: (existingMessages: Message[]) => Promise<Message[]>;
  /** Restore lastSyncAt from AsyncStorage on init */
  restoreLastSyncAt: () => Promise<void>;
  /** Current lastSyncAt value */
  lastSyncAt: string | null;
}

export function useMessageSync(): UseMessageSyncReturn {
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const restoreLastSyncAt = useCallback(async (): Promise<void> => {
    const stored = await storage.getLastSyncAt();
    setLastSyncAt(stored);
  }, []);

  const sync = useCallback(async (existingMessages: Message[]): Promise<Message[]> => {
    const since = lastSyncAt ?? new Date(0).toISOString();
    const allMessages: Message[] = [...existingMessages];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const res = await messagesApi.sync(since, cursor);
      const data = res.data as { items: Message[]; hasMore: boolean; nextCursor: string | null };

      const newMessages = data.items ?? [];

      // Deduplicate against existing messages by _id
      const existingIds = new Set(allMessages.map((m) => String(m._id)));
      const unique = newMessages.filter((m) => !existingIds.has(String(m._id)));
      allMessages.push(...unique);

      hasMore = data.hasMore ?? false;
      cursor = data.nextCursor ?? undefined;
    }

    // Update lastSyncAt to now
    const newSyncAt = new Date().toISOString();
    setLastSyncAt(newSyncAt);
    await storage.setLastSyncAt(newSyncAt);

    // Sort newest first
    allMessages.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return allMessages;
  }, [lastSyncAt]);

  return { sync, restoreLastSyncAt, lastSyncAt };
}
