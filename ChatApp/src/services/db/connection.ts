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
 *
 * NOTE: We expose a shim that mimics the older op-sqlite shape
 * ({ rows: { _array, length } } and synchronous execute / transaction).
 * Internally we delegate to executeSync (sync API in op-sqlite v11.x) so the
 * repository call-sites can stay synchronous.
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

// Raw op-sqlite handle surface we rely on (subset of v11.x DB type).
interface RawDb {
  executeSync: (sql: string, params?: unknown[]) => {
    rows: Array<Record<string, unknown>> | { _array?: unknown[]; length?: number };
    rowsAffected: number;
    insertId?: number | bigint;
  };
  close: () => void;
}

let _db: DbHandle | null = null;
let _raw: RawDb | null = null;

/**
 * Wrap a raw op-sqlite handle in a shim that:
 *   - reshapes execute() results to { rows: { _array, length } }
 *   - implements synchronous transaction(fn) via BEGIN/COMMIT/ROLLBACK
 */
function wrap(raw: RawDb): DbHandle {
  const reshape = (
    res: ReturnType<RawDb['executeSync']>,
  ): ReturnType<DbHandle['execute']> => {
    const rows = res.rows;
    let arr: unknown[];
    let len: number;
    if (Array.isArray(rows)) {
      arr = rows;
      len = rows.length;
    } else if (rows && Array.isArray((rows as { _array?: unknown[] })._array)) {
      arr = (rows as { _array: unknown[] })._array;
      len = arr.length;
    } else {
      arr = [];
      len = 0;
    }
    return {
      rows: { _array: arr, length: len },
      rowsAffected: res.rowsAffected ?? 0,
      insertId: res.insertId,
    };
  };

  return {
    execute(sql: string, params?: unknown[]) {
      return reshape(raw.executeSync(sql, params));
    },
    transaction(fn: () => void) {
      raw.executeSync('BEGIN');
      try {
        fn();
        raw.executeSync('COMMIT');
      } catch (err) {
        try {
          raw.executeSync('ROLLBACK');
        } catch {
          // ignore rollback errors — rethrow original
        }
        throw err;
      }
    },
    close() {
      raw.close();
    },
  };
}

/**
 * Returns the singleton DB handle, opening it if not yet open.
 * Must be called after the app documents directory is available (i.e. after
 * the React Native bridge is ready — not at module import time).
 */
export function getDb(): DbHandle {
  if (!_db) {
    _raw = open({ name: 'koola.db' }) as unknown as RawDb;
    _db = wrap(_raw);
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
    _raw = null;
  }
}

/**
 * Replace the singleton with a provided handle.
 * Used in tests to inject an in-memory database.
 */
export function _setDbForTesting(db: DbHandle | null): void {
  _db = db;
  _raw = null;
}
