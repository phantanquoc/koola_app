/**
 * connection.ts
 *
 * Singleton SQLite connection for koola.db.
 * Opens the database from the app's documents directory using op-sqlite (JSI).
 *
 * Usage:
 *   import { getDb, closeDb } from './connection';
 *   const db = getDb();
 *   db.execute('SELECT 1');
 */
import { open } from '@op-engineering/op-sqlite';

// op-sqlite DB handle type (minimal surface we use)
export interface DbHandle {
  execute(sql: string, params?: unknown[]): {
    rows: { _array: unknown[]; length: number };
    rowsAffected: number;
    insertId?: number | bigint;
  };
  transaction(fn: () => void): void;
  close(): void;
}

let _db: DbHandle | null = null;

/**
 * Returns the singleton DB handle, opening it if not yet open.
 * Must be called after the app documents directory is available (i.e. after
 * the React Native bridge is ready — not at module import time).
 */
export function getDb(): DbHandle {
  if (!_db) {
    _db = open({ name: 'koola.db' }) as unknown as DbHandle;
  }
  return _db;
}

/**
 * Close the database and reset the singleton.
 * Called on logout / account switch to ensure a clean state.
 */
export function closeDb(): void {
  if (_db) {
    try {
      _db.close();
    } catch {
      // ignore close errors
    }
    _db = null;
  }
}

/**
 * Replace the singleton with a provided handle.
 * Used in tests to inject an in-memory database.
 */
export function _setDbForTesting(db: DbHandle | null): void {
  _db = db;
}
