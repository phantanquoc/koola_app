/**
 * dbSize.ts
 *
 * Synchronous SQLite database size reader (task 7.2).
 *
 * Reads `PRAGMA page_count * PRAGMA page_size` to compute the on-disk size
 * of koola.db without scanning the filesystem. Both pragmas are synchronous
 * under op-sqlite's JSI binding, so this returns instantly.
 *
 * Guard: if the database has not been opened yet (e.g. before login or after
 * logout), returns 0 rather than auto-opening the connection. This avoids
 * triggering side effects from diagnostic code paths like StorageSettingsScreen.
 */

import { getDbIfOpen } from './connection';

/**
 * Return the current size of the SQLite database in bytes.
 * Returns 0 when the database is not open (pre-login / post-logout).
 */
export function getSqliteDatabaseSize(): number {
  const db = getDbIfOpen();
  if (!db) return 0;

  try {
    const pageCountRes = db.execute('PRAGMA page_count');
    const pageSizeRes = db.execute('PRAGMA page_size');

    const pageCountRow = pageCountRes.rows._array[0] as Record<string, unknown> | undefined;
    const pageSizeRow = pageSizeRes.rows._array[0] as Record<string, unknown> | undefined;

    // op-sqlite returns pragma results as { page_count: N } or { page_size: N }
    // depending on the column name used by SQLite. Extract the first value.
    const pageCount = Number(
      pageCountRow?.page_count ??
      Object.values(pageCountRow ?? {})[0] ??
      0,
    );
    const pageSize = Number(
      pageSizeRow?.page_size ??
      Object.values(pageSizeRow ?? {})[0] ??
      0,
    );

    if (!Number.isFinite(pageCount) || !Number.isFinite(pageSize)) return 0;
    return Math.floor(pageCount) * Math.floor(pageSize);
  } catch (err) {
    console.warn('[dbSize] Failed to read SQLite size:', err);
    return 0;
  }
}
