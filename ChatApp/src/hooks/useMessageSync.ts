import { useCallback, useRef } from 'react';
import { messagesApi } from '../services/api/apiService';
import { asyncStorage } from '../services/storage/asyncStorage';
import { isLocalFirstEnabled } from '../config/featureFlags';
import * as messageRepository from '../services/db/messageRepository';
import * as syncStateRepository from '../services/db/syncStateRepository';
import type { Message } from '../types';

export function useMessageSync() {
  const isSyncing = useRef(false);

  const sync = useCallback(async (): Promise<Message[]> => {
    if (isSyncing.current) return [];
    isSyncing.current = true;

    try {
      // ─── SQLite path (task 5.5) ──────────────────────────────────────────
      if (isLocalFirstEnabled()) {
        let lastSyncAt = syncStateRepository.getCursor('global');
        if (!lastSyncAt) {
          // Fall back to AsyncStorage for first-run migration
          lastSyncAt = await asyncStorage.getLastSyncAt();
          if (!lastSyncAt) lastSyncAt = new Date(0).toISOString();
        }

        const allMessages: Message[] = [];
        let cursor: string | undefined;
        let hasMore = true;

        while (hasMore) {
          const data = await messagesApi.sync(lastSyncAt, cursor, 100);
          // Upsert into SQLite
          if (data.items.length > 0) {
            const inputs = data.items.map((msg: any) => ({
              id: String(msg._id ?? msg.id ?? ''),
              conversationId: String(msg.conversationId ?? ''),
              senderId: String(msg.senderId?._id ?? msg.senderId ?? ''),
              clientMessageId: msg.clientMessageId ?? null,
              type: msg.type ?? 'text',
              content: msg.content ?? '',
              mediaKey: msg.mediaUrl ?? null,
              mediaMimeType: msg.mediaMimeType ?? null,
              mediaSize: msg.mediaSize ?? null,
              mediaDuration: msg.mediaDuration ?? null,
              mediaThumbnailKey: msg.mediaThumbnailKey ?? null,
              imageWidth: msg.imageWidth ?? null,
              imageHeight: msg.imageHeight ?? null,
              blurhash: msg.blurhash ?? null,
              createdAt: msg.createdAt,
              updatedAt: msg.updatedAt ?? msg.createdAt,
              status: msg.status ?? 'sent',
              deleted: Boolean(msg.deleted),
              deletedFor: Array.isArray(msg.deletedFor) ? msg.deletedFor : [],
              readBy: Array.isArray(msg.readBy) ? msg.readBy : [],
              reactions: Array.isArray(msg.reactions) ? msg.reactions : [],
              replyTo: msg.replyTo ?? null,
              replyToPreview: msg.replyToPreview ?? null,
            }));
            messageRepository.upsertMany(inputs);
          }
          allMessages.push(...data.items);
          hasMore = data.hasMore;
          cursor = data.nextCursor || undefined;
        }

        // Advance cursor in SQLite
        syncStateRepository.setCursor('global', new Date().toISOString());
        return allMessages;
      }

      // ─── Legacy AsyncStorage path ────────────────────────────────────────
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
    if (isLocalFirstEnabled()) {
      return syncStateRepository.getCursor('global');
    }
    return asyncStorage.getLastSyncAt();
  }, []);

  return { sync, restoreLastSyncAt };
}

