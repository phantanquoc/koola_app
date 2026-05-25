/**
 * syncStateRepository.ts
 *
 * Repository for the `sync_state` SQLite table.
 * Stores the global sync cursor (lastSyncAt ISO timestamp) keyed 'global'.
 * Also stores the `backfill_done` marker.
 */
import { getDb } from './connection';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the last_synced_at value for a given key.
 * Returns null if no row exists.
 */
export function getCursor(key: string): string | null {
  const db = getDb();
  const result = db.execute(
    'SELECT last_synced_at FROM sync_state WHERE key = ? LIMIT 1',
    [key],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows._array[0] as { last_synced_at: string | null };
  return row.last_synced_at ?? null;
}

/**
 * Set the last_synced_at value for a given key.
 */
export function setCursor(key: string, isoTimestamp: string): void {
  const db = getDb();
  db.execute(
    `INSERT INTO sync_state (key, last_synced_at, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       last_synced_at = excluded.last_synced_at,
       updated_at = excluded.updated_at`,
    [key, isoTimestamp, Date.now()],
  );
}

/**
 * Get a generic string value from sync_state (used for backfill_done, account_id, etc.)
 */
export function getValue(key: string): string | null {
  return getCursor(key);
}

/**
 * Set a generic string value in sync_state.
 */
export function setValue(key: string, value: string): void {
  setCursor(key, value);
}

/**
 * Delete all sync_state rows. Used on logout.
 */
export function clearAll(): void {
  const db = getDb();
  db.execute('DELETE FROM sync_state');
}
