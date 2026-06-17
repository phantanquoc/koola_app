import { useCallback } from 'react';
import * as outboxRepository from '../../../services/db/outboxRepository';
import * as messageRepository from '../../../services/db/messageRepository';

export interface UseDeadLetterActionsResult {
  /**
   * Retry a failed (dead-letter) send. Flips the outbox row back to pending so
   * the sync worker re-attempts it, and flips the local message row to pending
   * so the bubble updates immediately. `messageId` is the temp_xxx id stored in
   * the messages table.
   */
  handleRetryFailedMessage: (messageId: string) => void;
  /**
   * Permanently discard a failed message: hard-deletes both the outbox row (so
   * it leaves the dead-letter list) and the temp message row (so the bubble
   * disappears). `messageId` is the temp_xxx id stored in the messages table.
   */
  handleDiscardFailedMessage: (messageId: string) => void;
}

/**
 * Dead-letter retry / discard actions for failed message bubbles.
 *
 * Extracted from ChatScreen — the handlers operate purely on the outbox +
 * message repositories and do not read React state or screen params, so they
 * carry empty dependency arrays (stable identities for the lifetime of the
 * screen).
 */
export function useDeadLetterActions(): UseDeadLetterActionsResult {
  const handleRetryFailedMessage = useCallback((messageId: string) => {
    // messageId here is the temp_xxx id stored in messages table.
    try {
      const rows = outboxRepository.getDeadLetterRows();
      // getDeadLetterRows has no payload_json, so match on message_id / id.
      const row = rows.find(
        (r) => r.message_id === messageId || r.id === messageId,
      );
      if (row) {
        outboxRepository.markPendingForRetry(row.id);
        // Flip the messages row back to pending so the UI updates immediately.
        messageRepository.markPendingFromRetry(messageId);
      }
    } catch (err) {
      console.warn('[useDeadLetterActions] retry error:', err);
    }
  }, []);

  const handleDiscardFailedMessage = useCallback((messageId: string) => {
    try {
      const rows = outboxRepository.getDeadLetterRows();
      const row = rows.find(
        (r) => r.message_id === messageId || r.id === messageId,
      );
      if (row) {
        // Hard-delete the outbox row so it no longer appears in dead-letter list.
        outboxRepository.deleteRow(row.id);
      }
      // Hard-delete the temp messages row.
      messageRepository.deleteById(messageId);
    } catch (err) {
      console.warn('[useDeadLetterActions] discard error:', err);
    }
  }, []);

  return { handleRetryFailedMessage, handleDiscardFailedMessage };
}
