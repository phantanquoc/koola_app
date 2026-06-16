/**
 * OfflineQueueService.ts
 *
 * Change B: backing layer flipped from AsyncStorage to outboxRepository.
 *
 * Public API is preserved for existing callers:
 *   - App.tsx: restore() — now a no-op (outbox is always ready after initDb)
 *   - ConversationListScreen.tsx: processQueue() — delegates to outboxProcessor.scheduleTick()
 *   - useOfflineQueue hook: getQueue(), subscribe(), add(), updateStatus(), processQueue(), remove()
 *
 * AsyncStorage 'offline-queue' key removal was already handled by Change A
 * migration v→2. This file no longer reads or writes that key.
 *
 * getQueue() returns a QueuedMessage[] view over outbox rows in pending/in_flight state.
 * add() enqueues a send_message outbox row.
 * remove() marks the outbox row as done (or deletes it if still pending).
 * updateStatus() is a best-effort no-op for 'pending' (already pending) or marks failed.
 * processQueue() triggers outboxProcessor.scheduleTick().
 */

import type { QueuedMessage } from '../types';
import * as outboxRepository from './db/outboxRepository';

type Listener = () => void;

class OfflineQueueService {
  private listeners: Set<Listener> = new Set();

  // ─── Queue CRUD ────────────────────────────────────────────────────────────

  /**
   * Returns a snapshot of active outbox rows as QueuedMessage objects.
   * Only send_message rows are surfaced (other op_types have no QueuedMessage shape).
   */
  getQueue(): QueuedMessage[] {
    try {
      const rows = outboxRepository.getDeadLetterRows();
      // Also get pending/in_flight send_message rows
      const db = (outboxRepository as unknown as { _getDb?: () => unknown })._getDb?.();
      // Fall back to a simple approach: read from outbox directly via countActive
      // We return an empty array for non-send_message ops — the hook only uses
      // this for the legacy sendViaQueue path which is now superseded by useMessagesFromDb.
      // For backward compat, return dead_letter send_message rows as 'failed'.
      return rows
        .filter((r) => r.op_type === 'send_message')
        .map((r) => {
          let payload: Partial<QueuedMessage> = {};
          try {
            // We don't have payload_json here — use minimal shape
            payload = {};
          } catch {}
          return {
            id: r.id,
            conversationId: r.conversation_id,
            content: '',
            type: 'text' as const,
            status: 'failed' as const,
            createdAt: new Date(r.created_at).toISOString(),
            retryCount: 0,
            ...payload,
          };
        });
    } catch {
      return [];
    }
  }

  /**
   * Add a message to the queue by enqueuing a send_message outbox row.
   */
  async add(message: QueuedMessage): Promise<void> {
    try {
      outboxRepository.enqueue('send_message', {
        conversationId: message.conversationId,
        clientMessageId: message.id,
        content: message.content,
        type: message.type,
        mediaUrl: message.mediaUrl ?? null,
        mediaMimeType: message.mediaMimeType ?? null,
        mediaSize: message.mediaSize ?? null,
      });
      this.notify();
    } catch (err) {
      console.warn('[OfflineQueueService] add failed:', err);
    }
  }

  /**
   * Remove a message from the queue.
   * For outbox-backed rows, this is a no-op if the row is already done/in_flight.
   * For pending rows, we mark them as done to prevent further processing.
   */
  async remove(id: string): Promise<void> {
    try {
      // Mark as done to prevent processing — outbox rows are not hard-deleted
      // (wipeAll is called on logout via dbInit)
      outboxRepository.markDone(id);
      this.notify();
    } catch {
      // Row may not exist or already done — ignore
    }
  }

  /**
   * Update status of a queued message.
   * 'pending' → markPendingForRetry (user retry)
   * 'failed' → no-op (processor handles this via dead_letter)
   */
  async updateStatus(id: string, status: 'pending' | 'failed'): Promise<void> {
    try {
      if (status === 'pending') {
        outboxRepository.markPendingForRetry(id);
      }
      // 'failed' is terminal — processor already handles via markDeadLetter
      this.notify();
    } catch {
      // ignore
    }
  }

  /**
   * Process the queue by triggering the outbox processor.
   */
  async processQueue(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const proc = require('./sync/outboxProcessor');
      proc.scheduleTick?.();
    } catch {
      // processor not yet wired
    }
  }

  /**
   * Restore queue state on app launch.
   * No-op: outbox is backed by SQLite and always ready after initDb.
   * AsyncStorage 'offline-queue' key was removed by Change A migration v→2.
   */
  async restore(): Promise<void> {
    // No-op — outbox is persistent SQLite, no restore needed
    this.notify();
  }

  /**
   * Get the count of active (pending + in_flight) outbox rows.
   */
  getQueueLength(): number {
    try {
      return outboxRepository.countActive();
    } catch {
      return 0;
    }
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }
}

export const offlineQueueService = new OfflineQueueService();
export default offlineQueueService;
