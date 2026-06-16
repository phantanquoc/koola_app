/**
 * asyncStorageQueueBackfill.ts
 *
 * One-shot migration: reads the legacy AsyncStorage 'offline_queue' key
 * and backfills each item into the outbox table as a send_message row.
 *
 * Called from dbInit.ts when outbox_migration_version < 1.
 *
 * IMPORTANT: This function does NOT delete the AsyncStorage key.
 * Deletion is reserved for outbox_migration_version=2 in Change B,
 * after at least one release of telemetry has confirmed v→1 backfill
 * is reliable in the wild.
 *
 * See: local-first-outbox-integration (Change B) for the deletion step.
 */
import { asyncStorage } from '../storage/asyncStorage';
import { getDb } from './connection';
import { generateClientId } from '../../utils/clientId';
import type { QueuedMessage } from '../../types';

/**
 * Run the AsyncStorage → outbox backfill.
 *
 * Reads 'offline_queue' from AsyncStorage, maps each QueuedMessage to an
 * outbox row, and inserts them inside a single SQLite transaction.
 *
 * Items with status='failed' are inserted as state='dead_letter'.
 * Items with status='pending' are inserted as state='pending'.
 * Invalid or incomplete items are skipped with a warn log.
 *
 * Idempotent: uses INSERT OR IGNORE on the outbox id (UUID v7 generated
 * per item). If the migration runs twice (e.g. after a crash before the
 * version counter was written), items may be re-inserted with new UUIDs —
 * this is acceptable because the outbox processor will deduplicate via
 * the partial unique index on (op_type, dedup_key) for coalescing ops.
 * send_message rows have no dedup_key so duplicates are possible; the
 * backend's clientMessageId dedup window prevents double-send.
 */
export async function runAsyncStorageQueueBackfill(): Promise<void> {
  const raw = await asyncStorage.getOfflineQueue();
  if (!raw) {
    // No legacy queue — nothing to backfill
    return;
  }

  let items: unknown[];
  try {
    const parsed = JSON.parse(raw);
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn('[outbox] backfill_skip_item: AsyncStorage queue is not valid JSON');
    return;
  }

  if (items.length === 0) return;

  const db = getDb();
  const now = Date.now();

  db.transaction(() => {
    for (const item of items) {
      try {
        const msg = item as Partial<QueuedMessage>;

        // Validate required fields
        if (!msg.id || !msg.conversationId || msg.content === undefined) {
          console.warn('[outbox] backfill_skip_item: missing required field', {
            id: msg.id,
            conversationId: msg.conversationId,
          });
          continue;
        }

        if (typeof msg.conversationId !== 'string' || !msg.conversationId) {
          console.warn('[outbox] backfill_skip_item: invalid conversationId');
          continue;
        }

        const outboxId = generateClientId();
        const state = msg.status === 'failed' ? 'dead_letter' : 'pending';
        const payload = JSON.stringify({
          conversationId: msg.conversationId,
          clientMessageId: msg.id, // legacy id is the clientMessageId
          content: msg.content ?? '',
          type: msg.type ?? 'text',
          mediaUrl: msg.mediaUrl ?? null,
          mediaMimeType: msg.mediaMimeType ?? null,
          mediaSize: msg.mediaSize ?? null,
        });

        const lastError = state === 'dead_letter'
          ? JSON.stringify({ code: 'NETWORK', hint: 'Backfilled from legacy failed queue' })
          : null;

        db.execute(
          `INSERT OR IGNORE INTO outbox
             (id, op_type, payload_version, payload_json, conversation_id,
              message_id, dedup_key, state, retry_count, next_retry_at,
              created_at, updated_at, last_error, last_error_at)
           VALUES (?, 'send_message', 1, ?, ?, NULL, NULL, ?, 0, 0, ?, ?, ?, ?)`,
          [
            outboxId,
            payload,
            msg.conversationId,
            state,
            now,
            now,
            lastError,
            state === 'dead_letter' ? now : null,
          ],
        );
      } catch (err) {
        console.warn('[outbox] backfill_skip_item: error processing item', err);
        // Continue with next item — don't abort the whole backfill
      }
    }
  });
}
