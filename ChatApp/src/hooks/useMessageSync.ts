import { useCallback, useRef } from 'react';
import { messagesApi } from '../services/api/apiService';
import { asyncStorage } from '../services/storage/asyncStorage';
import type { Message } from '../types';

export function useMessageSync() {
  const isSyncing = useRef(false);

  const sync = useCallback(async (): Promise<Message[]> => {
    if (isSyncing.current) return [];
    isSyncing.current = true;

    try {
      let lastSyncAt = await asyncStorage.getLastSyncAt();
      if (!lastSyncAt) {
        lastSyncAt = new Date(0).toISOString();
      }

      const allMessages: Message[] = [];
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const data = await messagesApi.sync(lastSyncAt, cursor, 100);
        allMessages.push(...data.items);
        hasMore = data.hasMore;
        cursor = data.nextCursor || undefined;
      }

      // Update lastSyncAt to now
      await asyncStorage.setLastSyncAt(new Date().toISOString());

      return allMessages;
    } catch (err) {
      console.error('[useMessageSync] sync error:', err);
      return [];
    } finally {
      isSyncing.current = false;
    }
  }, []);

  const restoreLastSyncAt = useCallback(async (): Promise<string | null> => {
    return asyncStorage.getLastSyncAt();
  }, []);

  return { sync, restoreLastSyncAt };
}
