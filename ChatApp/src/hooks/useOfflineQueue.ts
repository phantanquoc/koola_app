import { useState, useEffect, useCallback } from 'react';
import { offlineQueueService } from '../services/OfflineQueueService';
import { generateClientId } from '../utils/clientId';
import type { QueuedMessage, MessageType } from '../types';

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedMessage[]>(offlineQueueService.getQueue());

  useEffect(() => {
    const unsubscribe = offlineQueueService.subscribe(() => {
      setQueue(offlineQueueService.getQueue());
    });
    return unsubscribe;
  }, []);

  const sendViaQueue = useCallback(
    (conversationId: string, content: string, type: MessageType = 'text') => {
      const id = generateClientId();
      const msg: QueuedMessage = {
        id,
        conversationId,
        content,
        type,
        status: 'pending',
        createdAt: new Date().toISOString(),
        retryCount: 0,
      };
      offlineQueueService.add(msg);
      return msg;
    },
    [],
  );

  const retryMessage = useCallback(async (id: string) => {
    // Reset retry
    const q = offlineQueueService.getQueue();
    const msg = q.find((m) => m.id === id);
    if (msg) {
      await offlineQueueService.updateStatus(id, 'pending');
      // Reset retryCount manually
      await offlineQueueService.processQueue();
    }
  }, []);

  const removeFromQueue = useCallback(async (id: string) => {
    await offlineQueueService.remove(id);
  }, []);

  return { queue, sendViaQueue, retryMessage, removeFromQueue };
}
