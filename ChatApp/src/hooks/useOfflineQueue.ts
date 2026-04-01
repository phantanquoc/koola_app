/**
 * useOfflineQueue — React hook wrapping OfflineQueueService.
 *
 * Exposes the current queue and operations for sending via queue,
 * retrying failed messages, and removing queued messages.
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { offlineQueueService, QueuedMessage } from '../services/OfflineQueueService';

export interface SendViaQueueParams {
  conversationId: string;
  content: string;
  type?: 'text' | 'image' | 'file' | 'voice' | 'system';
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaSize?: number;
  /** If provided, the optimistic message will use this _id so ChatScreen can track it */
  tempId?: string;
}

export interface UseOfflineQueueReturn {
  /** Current queue state */
  queue: QueuedMessage[];
  /**
   * Add a message to the offline queue.
   * Returns the tempId so callers can track the optimistic message.
   */
  sendViaQueue: (params: SendViaQueueParams) => Promise<string>;
  /** Reset a failed message back to pending and re-process the queue */
  retryMessage: (id: string) => Promise<void>;
  /** Permanently remove a message from the queue */
  removeFromQueue: (id: string) => Promise<void>;
}

export function useOfflineQueue(): UseOfflineQueueReturn {
  const [queue, setQueue] = useState<QueuedMessage[]>(offlineQueueService.getAll());

  useEffect(() => {
    const unsubscribe = offlineQueueService.subscribe(() => {
      setQueue(offlineQueueService.getAll());
    });
    return unsubscribe;
  }, []);

  const sendViaQueue = useCallback(async (params: SendViaQueueParams): Promise<string> => {
    const clientMessageId = uuidv4();
    const tempId = params.tempId ?? `temp_${clientMessageId}`;
    const now = new Date().toISOString();

    await offlineQueueService.add({
      id: clientMessageId,
      conversationId: params.conversationId,
      content: params.content,
      type: params.type ?? 'text',
      mediaUrl: params.mediaUrl,
      mediaMimeType: params.mediaMimeType,
      mediaSize: params.mediaSize,
      createdAt: now,
      tempId,
    });

    return tempId;
  }, []);

  const retryMessage = useCallback(async (id: string): Promise<void> => {
    await offlineQueueService.resetRetryCount(id);
    await offlineQueueService.updateStatus(id, 'pending');
    await offlineQueueService.processQueue();
  }, []);

  const removeFromQueue = useCallback(async (id: string): Promise<void> => {
    await offlineQueueService.remove(id);
  }, []);

  return { queue, sendViaQueue, retryMessage, removeFromQueue };
}
