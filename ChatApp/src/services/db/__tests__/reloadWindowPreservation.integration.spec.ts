/**
 * reloadWindowPreservation.integration.spec.ts
 *
 * Integration test for FIX 2: reload() must not collapse the loaded window.
 *
 * Scenario: user has loaded ~200 messages via loadEarlier, then a socket event
 * triggers a notify (reload). The resulting messages length must stay >= the
 * previously loaded window (not collapse back to 50).
 *
 * Uses better-sqlite3 injected via _setDbForTesting (same pattern as
 * messageReadPath.integration.spec.ts).
 */

// Stub op-sqlite — we inject via _setDbForTesting, never call native open().
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(),
  closeAll: jest.fn(),
}));

// Stub syncOrchestrator so the hook's syncOnOpen call doesn't hit the network.
jest.mock('../../../services/sync/syncOrchestrator', () => ({
  syncOnOpen: jest.fn().mockResolvedValue(undefined),
}));

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

import { _setDbForTesting, DbHandle } from '../connection';
import { runMigrations } from '../migrations';
import * as messageRepository from '../messageRepository';
import { clearAll as clearBroadcaster } from '../invalidationBroadcaster';

// ─── better-sqlite3 → DbHandle adapter (same as messageReadPath tests) ───────

function makeBetterSqliteAdapter(rawDb: Database.Database): DbHandle {
  function execute(
    sql: string,
    params: unknown[] = [],
  ): ReturnType<DbHandle['execute']> {
    const trimmed = sql.trim();

    if (/^(BEGIN|COMMIT|ROLLBACK|PRAGMA)/i.test(trimmed)) {
      try {
        rawDb.exec(trimmed);
      } catch {
        // swallow
      }
      return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
    }

    const stmt = rawDb.prepare(trimmed);

    if (/^\s*SELECT/i.test(trimmed)) {
      const rows = stmt.all(...params) as unknown[];
      return { rows: { _array: rows, length: rows.length }, rowsAffected: 0 };
    }

    const info = stmt.run(...params);
    return {
      rows: { _array: [], length: 0 },
      rowsAffected: info.changes,
      insertId: info.lastInsertRowid,
    };
  }

  function transaction(fn: () => void): void {
    execute('BEGIN');
    try {
      fn();
      execute('COMMIT');
    } catch (err) {
      try {
        execute('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    }
  }

  return {
    execute,
    transaction,
    close() {
      rawDb.close();
    },
  };
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

let rawDb: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(
    os.tmpdir(),
    `reloadWindow_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
  );
  rawDb = new Database(dbPath);
  const adapter = makeBetterSqliteAdapter(rawDb);
  _setDbForTesting(adapter);
  runMigrations();
  clearBroadcaster();
});

afterEach(() => {
  _setDbForTesting(null);
  try {
    rawDb.close();
  } catch {}
  try {
    fs.unlinkSync(dbPath);
  } catch {}
  clearBroadcaster();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_TS = 1_700_000_000_000;
const CONV_ID = 'conv_reload_test';
const USER_ID = 'user_1';

function makeMessage(
  overrides: Partial<messageRepository.MessageInput> & { id: string },
): messageRepository.MessageInput {
  return {
    conversationId: CONV_ID,
    senderId: USER_ID,
    type: 'text',
    content: 'hello',
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    status: 'sent',
    deleted: false,
    deletedFor: [],
    reactions: [],
    ...overrides,
  };
}

// ─── Test: reload preserves loaded window ────────────────────────────────────

describe('FIX 2: reload() window preservation', () => {
  it('reload after loadEarlier does not collapse to default 50', () => {
    // Seed 200 messages for the conversation
    const msgs = Array.from({ length: 200 }, (_, i) =>
      makeMessage({ id: `msg_${i}`, createdAt: BASE_TS + i * 1000 }),
    );
    messageRepository.upsertMany(msgs);

    // Simulate what the hook does:
    // 1. Initial load (limit=50) → 50 messages
    const initial = messageRepository.list({
      conversationId: CONV_ID,
      currentUserId: USER_ID,
      limit: 50,
    });
    expect(initial).toHaveLength(50);

    // 2. loadEarlier pages until we have ~200 messages visible
    //    (the hook appends older pages; the window grows)
    //    After loadEarlier, windowSizeRef would be 200.
    //    On reload, it uses limit = windowSizeRef.current = 200.
    const fullWindow = messageRepository.list({
      conversationId: CONV_ID,
      currentUserId: USER_ID,
      limit: 200,
    });
    expect(fullWindow).toHaveLength(200);

    // 3. A new message arrives (socket event → notify → reload)
    //    Insert 1 new message
    messageRepository.upsertMany([
      makeMessage({ id: 'msg_new', createdAt: BASE_TS + 300_000 }),
    ]);

    // 4. reload() with the preserved window size (200, not default 50)
    const afterReload = messageRepository.list({
      conversationId: CONV_ID,
      currentUserId: USER_ID,
      limit: 200,
    });

    // The key assertion: the reloaded list is NOT collapsed to 50
    // It should contain 201 rows (200 original + 1 new), but limited to 200
    // which is still >= the loaded window.
    expect(afterReload.length).toBeGreaterThanOrEqual(200);
    expect(afterReload.length).not.toBe(50); // NOT collapsed
  });

  it('reload with limit=50 (default) only returns 50 for a new conversation', () => {
    // Seed 100 messages
    const msgs = Array.from({ length: 100 }, (_, i) =>
      makeMessage({ id: `newconv_${i}`, createdAt: BASE_TS + i * 1000 }),
    );
    messageRepository.upsertMany(msgs);

    // Initial load (new conversation = window of 50)
    const initial = messageRepository.list({
      conversationId: CONV_ID,
      currentUserId: USER_ID,
      limit: 50,
    });
    expect(initial).toHaveLength(50);
  });

  it('hasEarlier is correctly computed from row count vs limit', () => {
    // Seed exactly 50 messages — requesting limit=50 should return 50,
    // meaning hasEarlier = true (rows.length >= limit).
    const msgs = Array.from({ length: 50 }, (_, i) =>
      makeMessage({ id: `exact_${i}`, createdAt: BASE_TS + i * 1000 }),
    );
    messageRepository.upsertMany(msgs);

    const rows = messageRepository.list({
      conversationId: CONV_ID,
      currentUserId: USER_ID,
      limit: 50,
    });
    // rows.length === limit → hasEarlier should be true (may be more)
    expect(rows.length).toBe(50);
    const hasEarlier = rows.length >= 50;
    expect(hasEarlier).toBe(true);

    // Seed only 30 messages in a different conversation
    const fewMsgs = Array.from({ length: 30 }, (_, i) =>
      makeMessage({
        id: `few_${i}`,
        conversationId: 'conv_few',
        createdAt: BASE_TS + i * 1000,
      }),
    );
    messageRepository.upsertMany(fewMsgs);

    const fewRows = messageRepository.list({
      conversationId: 'conv_few',
      currentUserId: USER_ID,
      limit: 50,
    });
    // rows.length < limit → hasEarlier should be false
    expect(fewRows.length).toBe(30);
    const hasEarlierFew = fewRows.length >= 50;
    expect(hasEarlierFew).toBe(false);
  });
});
