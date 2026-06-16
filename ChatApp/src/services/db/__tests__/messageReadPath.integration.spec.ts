/**
 * messageReadPath.integration.spec.ts
 *
 * Integration tests for the SQLite read path using real better-sqlite3.
 * Exercises the REAL repository code (not raw SQL) by injecting a
 * better-sqlite3 adapter via _setDbForTesting.
 *
 * Run via: npm run test:integration
 *
 * Goals:
 *   A. Correctness — messageRepository.list
 *   B. Correctness — conversationRepository.list
 *   C. Index usage regression guard (EXPLAIN QUERY PLAN)
 *   D. Performance budget (meaningful here — real SQLite engine)
 */

// Stub op-sqlite so connection.ts import resolves without native module.
// We never call the real open() path; we inject via _setDbForTesting.
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(),
  closeAll: jest.fn(),
}));

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

import { _setDbForTesting, DbHandle } from '../connection';
import { runMigrations } from '../migrations';
import * as messageRepository from '../messageRepository';
import * as conversationRepository from '../conversationRepository';
import { clearAll as clearBroadcaster } from '../invalidationBroadcaster';

// ─── better-sqlite3 → DbHandle adapter ───────────────────────────────────────
//
// Mirrors the production shim in connection.ts:
//   - execute() reshapes results to { rows: { _array, length }, rowsAffected, insertId }
//   - transaction() uses explicit BEGIN/COMMIT/ROLLBACK (same path as production)
//   - close() delegates to rawDb.close()
//
// Special cases:
//   - SELECT → .all() (returns rows)
//   - BEGIN/COMMIT/ROLLBACK/PRAGMA → rawDb.exec() (no result set needed)
//   - Everything else → .run() (INSERT/UPDATE/DELETE/CREATE/DROP)

function makeBetterSqliteAdapter(rawDb: Database.Database): DbHandle {
  function execute(
    sql: string,
    params: unknown[] = [],
  ): ReturnType<DbHandle['execute']> {
    const trimmed = sql.trim();

    // Control statements: exec() is simplest; they return no rows.
    if (/^(BEGIN|COMMIT|ROLLBACK|PRAGMA)/i.test(trimmed)) {
      try {
        rawDb.exec(trimmed);
      } catch {
        // ROLLBACK on a non-active transaction is harmless; swallow.
      }
      return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
    }

    const stmt = rawDb.prepare(trimmed);

    if (/^\s*SELECT/i.test(trimmed)) {
      const rows = stmt.all(...params) as unknown[];
      return { rows: { _array: rows, length: rows.length }, rowsAffected: 0 };
    }

    // INSERT / UPDATE / DELETE / CREATE / DROP / etc.
    const info = stmt.run(...params);
    return {
      rows: { _array: [], length: 0 },
      rowsAffected: info.changes,
      insertId: info.lastInsertRowid,
    };
  }

  function transaction(fn: () => void): void {
    // Use the same BEGIN/COMMIT/ROLLBACK path as the production shim so we
    // exercise identical code paths.
    execute('BEGIN');
    try {
      fn();
      execute('COMMIT');
    } catch (err) {
      try {
        execute('ROLLBACK');
      } catch {
        // ignore rollback errors — rethrow original
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

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let rawDb: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `msgReadPath_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
  rawDb = new Database(dbPath);
  const adapter = makeBetterSqliteAdapter(rawDb);
  _setDbForTesting(adapter);
  runMigrations();
  clearBroadcaster();
});

afterEach(() => {
  _setDbForTesting(null);
  try { rawDb.close(); } catch {}
  try { fs.unlinkSync(dbPath); } catch {}
  clearBroadcaster();
});

// ─── Seed helpers (use REAL repository code, not raw SQL) ─────────────────────

const BASE_TS = 1_700_000_000_000;

function makeMessage(
  overrides: Partial<messageRepository.MessageInput> & { id: string },
): messageRepository.MessageInput {
  return {
    conversationId: 'conv_a',
    senderId: 'user_1',
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

function makeConversation(
  overrides: Partial<conversationRepository.ConversationInput> & { id: string },
): conversationRepository.ConversationInput {
  return {
    type: 'direct',
    name: null,
    lastMessageAt: BASE_TS,
    pinned: false,
    archived: false,
    updatedAt: BASE_TS,
    ...overrides,
  };
}

// ─── A. Correctness — messageRepository.list ─────────────────────────────────

describe('A. messageRepository.list — correctness', () => {
  it('returns messages newest-first (createdAt DESC)', () => {
    messageRepository.upsertMany([
      makeMessage({ id: 'msg_1', createdAt: BASE_TS + 1000 }),
      makeMessage({ id: 'msg_2', createdAt: BASE_TS + 3000 }),
      makeMessage({ id: 'msg_3', createdAt: BASE_TS + 2000 }),
    ]);

    const rows = messageRepository.list({ conversationId: 'conv_a', currentUserId: 'user_1' });
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(['msg_2', 'msg_3', 'msg_1']);
  });

  it('excludes rows with deleted=true', () => {
    messageRepository.upsertMany([
      makeMessage({ id: 'visible', createdAt: BASE_TS + 1000 }),
      makeMessage({ id: 'deleted', createdAt: BASE_TS + 2000, deleted: true }),
    ]);

    const rows = messageRepository.list({ conversationId: 'conv_a', currentUserId: 'user_1' });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain('visible');
    expect(ids).not.toContain('deleted');
  });

  it('excludes rows where deleted_for contains currentUserId', () => {
    const currentUserId = 'user_me';
    messageRepository.upsertMany([
      makeMessage({ id: 'hidden_for_me', createdAt: BASE_TS + 1000, deletedFor: [currentUserId] }),
      makeMessage({ id: 'hidden_for_other', createdAt: BASE_TS + 2000, deletedFor: ['other_user'] }),
      makeMessage({ id: 'visible', createdAt: BASE_TS + 3000, deletedFor: [] }),
    ]);

    const rows = messageRepository.list({ conversationId: 'conv_a', currentUserId });
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain('hidden_for_me');
    expect(ids).toContain('hidden_for_other');
    expect(ids).toContain('visible');
  });

  it('respects limit — returns exactly limit rows when more exist', () => {
    const msgs = Array.from({ length: 30 }, (_, i) =>
      makeMessage({ id: `lim_${i}`, createdAt: BASE_TS + i * 1000 }),
    );
    messageRepository.upsertMany(msgs);

    const rows = messageRepository.list({ conversationId: 'conv_a', currentUserId: 'user_1', limit: 10 });
    expect(rows).toHaveLength(10);
  });

  it('before cursor returns only older messages (page 2 all older than page 1 oldest)', () => {
    const msgs = Array.from({ length: 20 }, (_, i) =>
      makeMessage({ id: `page_${i}`, createdAt: BASE_TS + i * 1000 }),
    );
    messageRepository.upsertMany(msgs);

    const page1 = messageRepository.list({ conversationId: 'conv_a', currentUserId: 'user_1', limit: 5 });
    expect(page1).toHaveLength(5);

    const oldestPage1CreatedAt = page1[page1.length - 1].createdAt as number;

    const page2 = messageRepository.list({
      conversationId: 'conv_a',
      currentUserId: 'user_1',
      limit: 5,
      before: oldestPage1CreatedAt,
    });

    expect(page2.length).toBeGreaterThan(0);
    for (const msg of page2) {
      expect(msg.createdAt as number).toBeLessThan(oldestPage1CreatedAt);
    }
  });
});

// ─── B. Correctness — conversationRepository.list ────────────────────────────

describe('B. conversationRepository.list — correctness', () => {
  it('orders: archived ASC, pinned DESC, last_message_at DESC', () => {
    // Seed a deliberate mix to verify the composite sort:
    //   Expected order:
    //     1. pinned_newer   (archived=0, pinned=1, last_message_at=BASE+3000)
    //     2. pinned_older   (archived=0, pinned=1, last_message_at=BASE+1000)
    //     3. normal_newer   (archived=0, pinned=0, last_message_at=BASE+2000)
    //     4. normal_older   (archived=0, pinned=0, last_message_at=BASE+500)
    //     5. archived_one   (archived=1, pinned=0, last_message_at=BASE+9000)
    conversationRepository.upsertMany([
      makeConversation({ id: 'normal_older',  pinned: false, archived: false, lastMessageAt: BASE_TS + 500 }),
      makeConversation({ id: 'archived_one',  pinned: false, archived: true,  lastMessageAt: BASE_TS + 9000 }),
      makeConversation({ id: 'pinned_newer',  pinned: true,  archived: false, lastMessageAt: BASE_TS + 3000 }),
      makeConversation({ id: 'normal_newer',  pinned: false, archived: false, lastMessageAt: BASE_TS + 2000 }),
      makeConversation({ id: 'pinned_older',  pinned: true,  archived: false, lastMessageAt: BASE_TS + 1000 }),
    ]);

    const rows = conversationRepository.list({ limit: 10 });
    const ids = rows.map((r) => r.id);

    expect(ids).toEqual([
      'pinned_newer',
      'pinned_older',
      'normal_newer',
      'normal_older',
      'archived_one',
    ]);
  });

  it('respects limit and offset', () => {
    const convs = Array.from({ length: 10 }, (_, i) =>
      makeConversation({ id: `conv_${i}`, lastMessageAt: BASE_TS + i * 1000 }),
    );
    conversationRepository.upsertMany(convs);

    const page1 = conversationRepository.list({ limit: 3, offset: 0 });
    const page2 = conversationRepository.list({ limit: 3, offset: 3 });

    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(3);

    // No overlap between pages
    const page1Ids = new Set(page1.map((r) => r.id));
    for (const row of page2) {
      expect(page1Ids.has(row.id)).toBe(false);
    }
  });
});

// ─── C. Index usage regression guard ─────────────────────────────────────────
//
// Uses EXPLAIN QUERY PLAN via raw better-sqlite3 to assert that the indexes
// created in migration 001 are actually used by the queries the repositories
// issue. This is the core regression guard: if a future schema or query change
// causes SQLite to fall back to a full scan or temp sort, these tests fail.
//
// NOTE: The SQL strings below MUST mirror the exact queries in the repositories.
// If you change messageRepository.list or conversationRepository.list, update
// these strings to match.

describe('C. Index usage — EXPLAIN QUERY PLAN', () => {
  // Helper: run EXPLAIN QUERY PLAN and return concatenated detail strings.
  function explainPlan(sql: string, params: unknown[]): string {
    const rows = rawDb
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...params) as Array<{ detail: string }>;
    return rows.map((r) => r.detail).join('\n');
  }

  it('message list query uses idx_messages_conv_created', () => {
    // Seed at least one row so the planner has statistics.
    messageRepository.upsertMany([
      makeMessage({ id: 'idx_seed_1', conversationId: 'conv_idx', createdAt: BASE_TS }),
    ]);

    // This SQL mirrors messageRepository.list (no-before branch).
    // IMPORTANT: keep in sync with messageRepository.ts list() no-before branch.
    const sql = `
      SELECT * FROM messages
      WHERE conversation_id = ?
        AND deleted = 0
        AND deleted_for NOT LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `;
    const plan = explainPlan(sql, ['conv_idx', '%"user_1"%', 50]);

    // The covering index on (conversation_id, created_at DESC) must be used.
    expect(plan).toContain('idx_messages_conv_created');

    // Empirically verified against better-sqlite3 with the real migration-001
    // schema: WITH this index present, the planner satisfies ORDER BY created_at
    // DESC directly from the index and emits NO temp b-tree — the NOT LIKE
    // predicate on deleted_for does not force a sort. If the index were dropped,
    // the planner falls back to idx_messages_conv_updated AND emits
    // "USE TEMP B-TREE FOR ORDER BY". Asserting its absence therefore catches
    // not just index deletion but also index-column-reorder / optimizer
    // regressions that would reintroduce a sort on the chat-open hot path.
    expect(plan).not.toContain('USE TEMP B-TREE FOR ORDER BY');
  });

  it('conversation list query uses idx_conversations_list and avoids temp sort', () => {
    // Seed at least one row.
    conversationRepository.upsertMany([
      makeConversation({ id: 'conv_idx_seed', lastMessageAt: BASE_TS }),
    ]);

    // This SQL mirrors conversationRepository.list.
    // IMPORTANT: keep in sync with conversationRepository.ts list().
    const sql = `
      SELECT * FROM conversations
      ORDER BY archived ASC, pinned DESC, last_message_at DESC
      LIMIT ? OFFSET ?
    `;
    const plan = explainPlan(sql, [50, 0]);

    // The index on (archived ASC, pinned DESC, last_message_at DESC) must be
    // used — this is the whole point of idx_conversations_list.
    expect(plan).toContain('idx_conversations_list');

    // The conversations query has no WHERE filter that could force a temp sort,
    // so we assert strictly that no temp b-tree is needed.
    expect(plan).not.toContain('USE TEMP B-TREE FOR ORDER BY');
  });
});

// ─── D. Performance budget (real SQLite — meaningful here) ───────────────────
//
// better-sqlite3 is synchronous and much faster than the production JSI path,
// so these thresholds have a large safety margin. If CI is slow, relax to 50 ms
// with a comment rather than deleting the test.

describe('D. Performance budget', () => {
  it('messageRepository.list({ limit: 50 }) on 500-row conversation ≤ 20 ms', () => {
    const msgs = Array.from({ length: 500 }, (_, i) =>
      makeMessage({ id: `perf_msg_${i}`, conversationId: 'conv_perf', createdAt: BASE_TS + i * 1000 }),
    );
    messageRepository.upsertMany(msgs);

    // Warm
    messageRepository.list({ conversationId: 'conv_perf', currentUserId: 'user_1', limit: 50 });

    const t0 = Date.now();
    messageRepository.list({ conversationId: 'conv_perf', currentUserId: 'user_1', limit: 50 });
    const elapsed = Date.now() - t0;

    // 20 ms is generous for better-sqlite3; relax to 50 ms if CI is slow.
    expect(elapsed).toBeLessThanOrEqual(20);
  });

  it('conversationRepository.list({ limit: 50 }) on 200-row table ≤ 20 ms', () => {
    const convs = Array.from({ length: 200 }, (_, i) =>
      makeConversation({ id: `perf_conv_${i}`, lastMessageAt: BASE_TS + i * 1000 }),
    );
    conversationRepository.upsertMany(convs);

    // Warm
    conversationRepository.list({ limit: 50 });

    const t0 = Date.now();
    conversationRepository.list({ limit: 50 });
    const elapsed = Date.now() - t0;

    // 20 ms is generous for better-sqlite3; relax to 50 ms if CI is slow.
    expect(elapsed).toBeLessThanOrEqual(20);
  });
});
