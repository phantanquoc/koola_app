/**
 * dbInit.ts
 *
 * Database initialisation entry point.
 * Called from AuthContext after setUser() so the schema is ready before
 * any chat screen mounts.
 *
 * Responsibilities:
 *   1. Open the SQLite connection.
 *   2. Run forward-only migrations.
 *   3. Guard against cross-account data leakage: if the stored account_id
 *      differs from the new user's id, drop all data and recreate.
 *   4. Store the current account_id.
 *   5. Run MMKV → SQLite backfill once when LOCAL_FIRST_SQLITE flag is on.
 *
 * Dogfooding metrics (task 5.9):
 *   Logs [PERF dbInit] with init duration and backfill outcome.
 */
import { getDb, closeDb } from './connection';
import { runMigrations } from './migrations';
import * as messageRepository from './messageRepository';
import * as conversationRepository from './conversationRepository';
import * as syncStateRepository from './syncStateRepository';
import { wipeAll as wipeOutbox } from './outboxRepository';
import { clearAll as clearBroadcaster } from './invalidationBroadcaster';
import { isLocalFirstEnabled } from '../../config/featureFlags';
import { runBackfillFromMmkv } from './backfillFromMmkv';
import { runAsyncStorageQueueBackfill } from './asyncStorageQueueBackfill';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the database for the given user.
 * Safe to call multiple times — idempotent after first call for the same user.
 */
export async function initDb(userId: string): Promise<void> {
  const t0 = Date.now();
  try {
    // Open connection and run migrations
    runMigrations();

    // Cross-account guard: check stored account_id
    const db = getDb();
    const accountRow = db.execute(
      "SELECT value FROM account_state WHERE key = 'account_id' LIMIT 1",
    );
    const storedAccountId =
      accountRow.rows.length > 0
        ? (accountRow.rows._array[0] as { value: string }).value
        : null;

    if (storedAccountId && storedAccountId !== userId) {
      // Different user — wipe all data to prevent cross-account leakage
      console.warn(
        `[dbInit] Account switch detected (${storedAccountId} → ${userId}). Wiping DB.`,
      );
      await wipeAllData();
      // Re-run migrations on the fresh DB
      runMigrations();
    }

    // Store current account_id
    db.execute(
      `INSERT INTO account_state (key, value) VALUES ('account_id', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [userId],
    );

    // Task 5.7: Run MMKV → SQLite backfill once when flag is on.
    // Awaited so cold-start after upgrade doesn't flash empty list (Bug #8).
    // Non-fatal: on failure, logs and continues boot.
    const flagOn = isLocalFirstEnabled();
    if (__DEV__) {
      console.log(`[dbInit] LOCAL_FIRST_SQLITE=${flagOn}`);
    }
    if (flagOn) {
      try {
        await runBackfillFromMmkv();
        if (__DEV__) {
          console.log(`[PERF dbInit] backfill success totalMs=${Date.now() - t0}`);
        }
      } catch (err) {
        console.warn('[dbInit] backfill error (non-fatal):', err);
      }

      // AsyncStorage → outbox migration (v→1).
      // Runs once per install; idempotent via outbox_migration_version counter.
      try {
        const migV = parseInt(
          syncStateRepository.getValue('outbox_migration_version') ?? '0',
          10,
        );
        if (migV < 1) {
          await runAsyncStorageQueueBackfill();
          syncStateRepository.setValue('outbox_migration_version', '1');
        }
        // v < 2 step reserved for Change B: AsyncStorage.removeItem('offline_queue')
      } catch (err) {
        console.warn('[outbox] migration_v1_failed', err);
      }
    }

    if (__DEV__) {
      console.log(`[PERF dbInit] init done userId=${userId.slice(-6)} ms=${Date.now() - t0}`);
    }
  } catch (err) {
    console.error('[dbInit] Failed to initialise database:', err);
    throw err;
  }
}

/**
 * Wipe all chat data (messages, conversations, sync_state).
 * Called on logout and on account switch.
 */
export async function wipeAllData(): Promise<void> {
  try {
    messageRepository.wipeAll();
    conversationRepository.wipeAll();
    syncStateRepository.clearAll();
    clearBroadcaster();

    // Wipe outbox tables via repository (spec: access SHALL be through outboxRepository)
    wipeOutbox();

    // Also clear account_state
    const db = getDb();
    db.execute('DELETE FROM account_state');
  } catch (err) {
    console.warn('[dbInit] wipeAllData error:', err);
  }
}

/**
 * Close the database connection. Called on logout after wipeAllData.
 */
export function shutdownDb(): void {
  closeDb();
}
