/**
 * outboxRepository.ts
 *
 * Repository for the `outbox` SQLite table.
 *
 * The outbox is the single durable source-of-truth for all client-initiated
 * write intents against chat resources. It persists across app restarts,
 * crashes, and background suspension.
 *
 * Design decisions (see design.md):
 *   - Decision 1: 13-column schema + CHECK constraint + 3 indexes
 *   - Decision 2: 4-state machine (pending → in_flight → done | dead_letter)
 *   - Decision 3: Coalesce keys per op_type
 *   - Decision 4: Watchdog 240s for send_message, 30s for other ops
 *   - Decision 9: last_error fixed schema {code, status, hint}, no PII
 */
import { getDb } from './connection';
import { generateClientId } from '../../utils/clientId';
import { logOutbox } from '../sync/outboxLog';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OutboxOpType =
  | 'send_message'
  | 'react'
  | 'delete'
  | 'delete_for_me'
  | 'mark_read';

export type OutboxState = 'pending' | 'in_flight' | 'done' | 'dead_letter';

export type ErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | '4XX'
  | '5XX'
  | '401'
  | '403'
  | '404'
  | '429'
  | 'PARSE'
  | 'PARENT_FAILED'
  | 'UNSUPPORTED_VERSION'
  | 'WATCHDOG_TIMEOUT';

export interface OutboxError {
  code: ErrorCode;
  status: number | null;
  hint: string;
}

export interface OutboxRow {
  id: string;
  op_type: OutboxOpType;
  payload_version: number;
  payload_json: string;
  conversation_id: string;
  message_id: string | null;
  dedup_key: string | null;
  state: OutboxState;
  retry_count: number;
  next_retry_at: number;
  in_flight_at: number | null;
  created_at: number;
  updated_at: number;
  last_error: string | null;
  last_error_at: number | null;
}

// ─── Per-op payload interfaces ────────────────────────────────────────────────

export interface SendMessagePayloadV1 {
  conversationId: string;
  clientMessageId: string;
  content?: string;
  type?: string;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  mediaDuration?: number | null;
  replyTo?: string | null;
}

export interface ReactPayloadV1 {
  conversationId: string;
  messageId: string;
  userId: string;
  emoji: string | null; // null = clear reaction
}

export interface DeletePayloadV1 {
  conversationId: string;
  messageId: string;
}

export interface DeleteForMePayloadV1 {
  conversationId: string;
  messageId: string;
}

export interface MarkReadPayloadV1 {
  conversationId: string;
  upToTimestamp: number;
}

export type OutboxPayload =
  | SendMessagePayloadV1
  | ReactPayloadV1
  | DeletePayloadV1
  | DeleteForMePayloadV1
  | MarkReadPayloadV1;

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PAYLOAD_BYTES = 10 * 1024; // 10 KB
const MAX_RETRIES = 8;
const MAX_BACKOFF_MS = 30_000;
const WATCHDOG_SEND_MS = 240_000;   // 240s for send_message
const WATCHDOG_OTHER_MS = 30_000;   // 30s for other ops
const WATCHDOG_DEAD_LETTER_MS = 300_000; // 5min → dead_letter for send_message

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * UTF-8 byte length of a string, runtime-agnostic.
 * Replaces Node's Buffer.byteLength which does not exist in the Hermes runtime.
 */
function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate — pairs with the following low surrogate to form one
      // 4-byte UTF-8 sequence. Consume the next code unit.
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function serializeError(err: OutboxError): string {
  const s = JSON.stringify(err);
  return s.length > 500 ? s.slice(0, 497) + '...' : s;
}

function dedupKeyFor(
  opType: OutboxOpType,
  payload: OutboxPayload,
): string | null {
  switch (opType) {
    case 'send_message':
      return null; // each send is independent
    case 'react': {
      const p = payload as ReactPayloadV1;
      return `${p.messageId}:${p.userId}`;
    }
    case 'delete': {
      const p = payload as DeletePayloadV1;
      return p.messageId;
    }
    case 'delete_for_me': {
      const p = payload as DeleteForMePayloadV1;
      return p.messageId;
    }
    case 'mark_read': {
      const p = payload as MarkReadPayloadV1;
      return p.conversationId;
    }
  }
}

function messageIdFor(
  opType: OutboxOpType,
  payload: OutboxPayload,
): string | null {
  switch (opType) {
    case 'send_message': {
      // Link the outbox row to the optimistic messages-table row so the
      // dead-letter retry/discard handlers can find it. useMessagesFromDb
      // inserts the optimistic row with id = `temp_${clientMessageId}`.
      const p = payload as SendMessagePayloadV1;
      return p.clientMessageId ? `temp_${p.clientMessageId}` : null;
    }
    case 'react':
      return (payload as ReactPayloadV1).messageId;
    case 'delete':
      return (payload as DeletePayloadV1).messageId;
    case 'delete_for_me':
      return (payload as DeleteForMePayloadV1).messageId;
    default:
      return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue a write intent.
 *
 * Coalesce semantics per op_type (Decision 3):
 *   - send_message: always INSERT (dedup_key = NULL)
 *   - react: UPSERT last-write-wins on emoji
 *   - delete / delete_for_me: UPSERT idempotent
 *   - mark_read: UPSERT MAX(upToTimestamp)
 *
 * Calls outboxProcessor.scheduleTick() after successful insert/upsert
 * (wired in Phase 4 — the import is deferred to avoid circular deps).
 */
export function enqueue(
  opType: OutboxOpType,
  payload: OutboxPayload,
  options?: { payloadVersion?: number },
): string {
  // Payload size guard
  const payloadJson = JSON.stringify(payload);
  if (utf8ByteLength(payloadJson) > MAX_PAYLOAD_BYTES) {
    throw new Error(`[outbox] enqueue: payload exceeds 10 KB for op_type=${opType}`);
  }

  // clientMessageId required for send_message
  if (opType === 'send_message') {
    const p = payload as SendMessagePayloadV1;
    if (!p.clientMessageId) {
      throw new Error('[outbox] enqueue: send_message requires clientMessageId');
    }
  }

  const db = getDb();
  const now = Date.now();
  const id = generateClientId();
  const payloadVersion = options?.payloadVersion ?? 1;
  const dedupKey = dedupKeyFor(opType, payload);
  const messageId = messageIdFor(opType, payload);
  const conversationId = (payload as { conversationId: string }).conversationId;

  if (dedupKey === null) {
    // send_message: always INSERT
    db.execute(
      `INSERT INTO outbox
         (id, op_type, payload_version, payload_json, conversation_id, message_id,
          dedup_key, state, retry_count, next_retry_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', 0, 0, ?, ?)`,
      [id, opType, payloadVersion, payloadJson, conversationId, messageId, now, now],
    );
  } else {
    // Coalescing ops: INSERT ... ON CONFLICT DO UPDATE
    let upsertSet: string;
    if (opType === 'mark_read') {
      // MAX(upToTimestamp) merge
      upsertSet = `
        payload_json = CASE
          WHEN json_extract(excluded.payload_json, '$.upToTimestamp') >
               json_extract(outbox.payload_json, '$.upToTimestamp')
          THEN excluded.payload_json
          ELSE outbox.payload_json
        END,
        updated_at = excluded.updated_at`;
    } else {
      // last-write-wins (react emoji change, delete idempotent)
      upsertSet = `payload_json = excluded.payload_json, updated_at = excluded.updated_at`;
    }

    db.execute(
      `INSERT INTO outbox
         (id, op_type, payload_version, payload_json, conversation_id, message_id,
          dedup_key, state, retry_count, next_retry_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?)
       ON CONFLICT(op_type, dedup_key)
         WHERE dedup_key IS NOT NULL AND state IN ('pending','in_flight')
       DO UPDATE SET ${upsertSet}`,
      [id, opType, payloadVersion, payloadJson, conversationId, messageId, dedupKey, now, now],
    );
  }

  incrementMetric('enqueued_total');
  logOutbox('enqueued', { op_type: opType, conversation_id: conversationId });

  // Trigger processor (deferred import to avoid circular dependency)
  // outboxProcessor.scheduleTick() is called from Phase 4 wiring
  try {
    // Deferred require breaks the outboxRepository <-> outboxProcessor cycle.
    const proc = require('../sync/outboxProcessor');
    proc.scheduleTick?.();
    proc.ensurePeriodicInterval?.();
  } catch {
    // processor not yet wired — acceptable during boot
  }

  return id;
}

/**
 * Get due rows for processing.
 *
 * Returns at most one due row per conversation (up to conversationLimit
 * conversations), sorted by created_at ASC within each conversation.
 *
 * Excludes send_message rows whose payload.replyTo starts with 'temp_'
 * (reply blocking — Decision 8).
 */
export function getDue(opts: {
  now: number;
  conversationLimit?: number;
}): OutboxRow[] {
  const db = getDb();
  const { now, conversationLimit = 3 } = opts;

  // Pick up to conversationLimit distinct conversations with due rows
  const convResult = db.execute(
    `SELECT conversation_id, MIN(created_at) as min_created
     FROM outbox
     WHERE state = 'pending'
       AND next_retry_at <= ?
       AND (
         op_type != 'send_message'
         OR json_extract(payload_json, '$.replyTo') IS NULL
         OR json_extract(payload_json, '$.replyTo') NOT LIKE 'temp_%'
       )
     GROUP BY conversation_id
     ORDER BY min_created ASC
     LIMIT ?`,
    [now, conversationLimit],
  );

  if (convResult.rows.length === 0) return [];

  const rows: OutboxRow[] = [];
  for (const convRow of convResult.rows._array as { conversation_id: string }[]) {
    const rowResult = db.execute(
      `SELECT * FROM outbox
       WHERE state = 'pending'
         AND next_retry_at <= ?
         AND conversation_id = ?
         AND (
           op_type != 'send_message'
           OR json_extract(payload_json, '$.replyTo') IS NULL
           OR json_extract(payload_json, '$.replyTo') NOT LIKE 'temp_%'
         )
       ORDER BY created_at ASC
       LIMIT 1`,
      [now, convRow.conversation_id],
    );
    if (rowResult.rows.length > 0) {
      rows.push(rowResult.rows._array[0] as OutboxRow);
    }
  }

  return rows;
}

/**
 * Transition a row from pending → in_flight.
 */
export function markInFlight(id: string): void {
  const db = getDb();
  const now = Date.now();
  db.execute(
    `UPDATE outbox
     SET state = 'in_flight', in_flight_at = ?, updated_at = ?
     WHERE id = ? AND state = 'pending'`,
    [now, now, id],
  );
  logOutbox('in_flight', { id });
  incrementMetric('inflight_started_total');
}

/**
 * Transition a row from in_flight → done.
 */
export function markDone(id: string): void {
  const db = getDb();
  const now = Date.now();
  db.execute(
    `UPDATE outbox
     SET state = 'done', in_flight_at = NULL, updated_at = ?
     WHERE id = ?`,
    [now, id],
  );
  logOutbox('done', { id });
  incrementMetric('done_total');
}

/**
 * Transition a row from in_flight → pending (retryable error).
 *
 * Computes exponential backoff: min(2^retry_count * 1000 + jitter, 30000) ms.
 * Does NOT increment retry_count for 401 errors (per Decision 10).
 */
export function markRetryable(id: string, error: OutboxError): void {
  const db = getDb();
  const now = Date.now();

  // Read current retry_count
  const existing = db.execute(
    'SELECT retry_count FROM outbox WHERE id = ? LIMIT 1',
    [id],
  );
  if (existing.rows.length === 0) return;

  const currentRetry = (existing.rows._array[0] as { retry_count: number }).retry_count;
  const is401 = error.code === '401';

  // 401: retryable but don't increment counter (token refresh will happen)
  const newRetryCount = is401 ? currentRetry : currentRetry + 1;

  if (newRetryCount >= MAX_RETRIES) {
    markDeadLetter(id, error);
    return;
  }

  // Backoff: min(2^retry * 1000 + jitter, 30000)
  const jitter = Math.floor(Math.random() * 1000);
  const backoff = Math.min(Math.pow(2, newRetryCount) * 1000 + jitter, MAX_BACKOFF_MS);
  const nextRetryAt = now + backoff;

  db.execute(
    `UPDATE outbox
     SET state = 'pending',
         retry_count = ?,
         next_retry_at = ?,
         last_error = ?,
         last_error_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [newRetryCount, nextRetryAt, serializeError(error), now, now, id],
  );
  logOutbox('retry_scheduled', { id, retry_count: newRetryCount, backoff_ms: backoff, code: error.code });
  incrementMetric('retry_total');
}

/**
 * Transition a row to dead_letter (terminal failure).
 */
export function markDeadLetter(id: string, error: OutboxError): void {
  const db = getDb();
  const now = Date.now();
  db.execute(
    `UPDATE outbox
     SET state = 'dead_letter',
         last_error = ?,
         last_error_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [serializeError(error), now, now, id],
  );
  logOutbox('dead_letter', { id, code: error.code });
  incrementMetric('dead_letter_total');
}

/**
 * Watchdog reset: move stale in_flight rows back to pending.
 *
 * Two timeout buckets (Decision 4):
 *   - send_message: 240s → pending; >5min → dead_letter
 *   - other ops: 30s → pending
 */
export function watchdogReset(opts: { now: number }): void {
  const db = getDb();
  const { now } = opts;

  // send_message rows older than 5 min → dead_letter (past backend dedup window)
  const deadLetterThreshold = now - WATCHDOG_DEAD_LETTER_MS;
  const deadRows = db.execute(
    `SELECT id FROM outbox
     WHERE state = 'in_flight'
       AND op_type = 'send_message'
       AND in_flight_at < ?`,
    [deadLetterThreshold],
  );
  for (const row of deadRows.rows._array as { id: string }[]) {
    markDeadLetter(row.id, {
      code: 'WATCHDOG_TIMEOUT',
      status: null,
      hint: 'In-flight too long; past backend dedup window',
    });
  }

  // send_message rows 240s–5min → pending
  const sendWatchdogThreshold = now - WATCHDOG_SEND_MS;
  db.execute(
    `UPDATE outbox
     SET state = 'pending',
         next_retry_at = ?,
         updated_at = ?
     WHERE state = 'in_flight'
       AND op_type = 'send_message'
       AND in_flight_at < ?
       AND in_flight_at >= ?`,
    [now, now, sendWatchdogThreshold, deadLetterThreshold],
  );

  // Other ops: 30s → pending
  const otherWatchdogThreshold = now - WATCHDOG_OTHER_MS;
  db.execute(
    `UPDATE outbox
     SET state = 'pending',
         next_retry_at = ?,
         updated_at = ?
     WHERE state = 'in_flight'
       AND op_type != 'send_message'
       AND in_flight_at < ?`,
    [now, now, otherWatchdogThreshold],
  );

  logOutbox('watchdog_reset', { now });
  incrementMetric('watchdog_reset_total');
}

/**
 * BFS cascade: mark all outbox rows whose payload.replyTo references
 * parentClientMessageId as dead_letter with code='PARENT_FAILED'.
 * Recurses for replies of replies.
 */
export function cascadeDeadLetter(parentClientMessageId: string): void {
  const db = getDb();
  const error: OutboxError = {
    code: 'PARENT_FAILED',
    status: null,
    hint: 'Parent message failed to send',
  };

  // BFS queue
  const queue: string[] = [parentClientMessageId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find all rows whose replyTo references current (bare or temp_ prefixed)
    const tempPrefixed = `temp_${current}`;
    const children = db.execute(
      `SELECT id, payload_json FROM outbox
       WHERE json_extract(payload_json, '$.clientMessageId') != ?
         AND (
           json_extract(payload_json, '$.replyTo') = ?
           OR json_extract(payload_json, '$.replyTo') = ?
         )
         AND state NOT IN ('done')`,
      [current, current, tempPrefixed],
    );

    for (const child of children.rows._array as { id: string; payload_json: string }[]) {
      markDeadLetter(child.id, error);
      try {
        const childPayload = JSON.parse(child.payload_json) as { clientMessageId?: string };
        if (childPayload.clientMessageId) {
          queue.push(childPayload.clientMessageId);
        }
      } catch {
        // ignore parse errors
      }
    }
  }
}

/**
 * Wipe all outbox and outbox_metrics rows.
 * Called on logout via dbInit.wipeAllData.
 */
export function wipeAll(): void {
  const db = getDb();
  db.execute('DELETE FROM outbox');
  db.execute('DELETE FROM outbox_metrics');
}

/**
 * Increment a named counter in outbox_metrics.
 */
export function incrementMetric(key: string): void {
  const db = getDb();
  const now = Date.now();
  db.execute(
    `INSERT INTO outbox_metrics (key, value, updated_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET value = value + 1, updated_at = excluded.updated_at`,
    [key, now],
  );
}

/**
 * Get all metrics as a key→value map.
 */
export function getMetrics(): Record<string, number> {
  const db = getDb();
  const result = db.execute('SELECT key, value FROM outbox_metrics');
  const out: Record<string, number> = {};
  for (const row of result.rows._array as { key: string; value: number }[]) {
    out[row.key] = row.value;
  }
  return out;
}

/**
 * Count rows in pending or in_flight state.
 * Used by the processor to decide whether to keep the periodic interval running.
 */
export function countActive(): number {
  const db = getDb();
  const result = db.execute(
    `SELECT COUNT(*) as cnt FROM outbox WHERE state IN ('pending','in_flight')`,
  );
  return (result.rows._array[0] as { cnt: number }).cnt ?? 0;
}

/**
 * User-initiated retry: reset a dead_letter (or any) row back to pending
 * with a clean slate — retry_count=0, last_error cleared, next_retry_at=now.
 *
 * Semantics differ from watchdog reset (which preserves retry_count for
 * backoff history). User retry signals "try fresh, ignore prior failures."
 */
export function markPendingForRetry(id: string): void {
  const db = getDb();
  const now = Date.now();
  db.execute(
    `UPDATE outbox
     SET state = 'pending',
         retry_count = 0,
         next_retry_at = ?,
         in_flight_at = NULL,
         last_error = NULL,
         last_error_at = NULL,
         updated_at = ?
     WHERE id = ?`,
    [now, now, id],
  );
  logOutbox('pending_for_retry', { id });
}

/**
 * Compute the dead-letter rate over a rolling window.
 *
 * Reads `outbox_metrics` counters (persistent across restarts).
 * Returns rate=0 when sample < 10 (insufficient data).
 *
 * @param windowMs - rolling window in ms (default 1h). Currently unused
 *   because outbox_metrics are cumulative totals, not time-bucketed.
 *   The sample guard (< 10) is the primary suppression mechanism.
 */
export function getDeadLetterRate(_windowMs = 3_600_000): {
  rate: number;
  doneCount: number;
  deadLetterCount: number;
  sample: number;
} {
  const metrics = getMetrics();
  const doneCount = metrics['done_total'] ?? 0;
  const deadLetterCount = metrics['dead_letter_total'] ?? 0;
  const sample = doneCount + deadLetterCount;

  if (sample < 10) {
    return { rate: 0, doneCount, deadLetterCount, sample };
  }

  const rate = deadLetterCount / sample;
  return { rate, doneCount, deadLetterCount, sample };
}

/**
 * Return all rows currently in state='dead_letter'.
 * Used by the __DEV__ panel and threshold logic.
 */
export function getDeadLetterRows(): Array<{
  id: string;
  op_type: OutboxOpType;
  conversation_id: string;
  message_id: string | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}> {
  const db = getDb();
  const result = db.execute(
    `SELECT id, op_type, conversation_id, message_id, last_error, created_at, updated_at
     FROM outbox
     WHERE state = 'dead_letter'
     ORDER BY updated_at DESC`,
  );
  return result.rows._array as Array<{
    id: string;
    op_type: OutboxOpType;
    conversation_id: string;
    message_id: string | null;
    last_error: string | null;
    created_at: number;
    updated_at: number;
  }>;
}

/**
 * Hard-delete an outbox row by id.
 * Used by the Discard handler to permanently remove a dead-letter row
 * so it no longer appears in getDeadLetterRows().
 */
export function deleteRow(id: string): void {
  const db = getDb();
  db.execute('DELETE FROM outbox WHERE id = ?', [id]);
  logOutbox('discard', { id });
}

// Re-export constants for use in outboxProcessor
export { MAX_RETRIES, WATCHDOG_SEND_MS, WATCHDOG_OTHER_MS };

// ─── Done-row Reaper (Task 1.2) ──────────────────────────────────────────────

/**
 * Delete completed outbox rows older than `maxAgeMs` milliseconds.
 *
 * Only touches rows with state='done'. Rows in pending, in_flight, or
 * dead_letter are never deleted — dead_letter rows are retained for user
 * inspection / manual retry.
 *
 * Default maxAgeMs = 24 hours. Run during idle maintenance.
 */
export function deleteDoneOlderThan(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const db = getDb();
  const cutoff = Date.now() - maxAgeMs;
  const result = db.execute(
    `DELETE FROM outbox WHERE state = 'done' AND updated_at < ?`,
    [cutoff],
  );
  return result.rowsAffected;
}
