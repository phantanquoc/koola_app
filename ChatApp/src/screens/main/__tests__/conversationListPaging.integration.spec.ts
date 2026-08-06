/**
 * conversationListPaging.integration.spec.ts
 *
 * End-to-end proof against a real (in-memory) SQLite DB that the local-first
 * conversation list can surface ALL of a user's conversations.
 *
 * The unit tests in conversationPagination.spec.ts lock the arithmetic; this one
 * drives that arithmetic against conversationRepository to prove the read window
 * and the repository agree — i.e. that 61 seeded conversations really do come
 * back, and that no row is skipped or duplicated on the way.
 */

import { open } from '@op-engineering/op-sqlite';
import { _setDbForTesting } from '../../../services/db/connection';
import { runMigrations } from '../../../services/db/migrations';
import * as repo from '../../../services/db/conversationRepository';
import { clearAll as clearBroadcaster } from '../../../services/db/invalidationBroadcaster';
import {
  CONVERSATION_PAGE_SIZE,
  INITIAL_PAGINATION_STATE,
  advancePagination,
  dbReadLimit,
  hasMoreFromWindow,
  requestPage,
  type PaginationState,
} from '../conversationPagination';

const TOTAL = 61;

let db: ReturnType<typeof open>;
let _dbCounter = 0;

beforeEach(() => {
  _dbCounter++;
  db = open({ name: `test_conv_paging_${_dbCounter}` });
  _setDbForTesting(db as never);
  runMigrations();
  clearBroadcaster();
});

afterEach(() => {
  _setDbForTesting(null);
  try {
    (db as unknown as { close?: () => void }).close?.();
  } catch {
    // Best-effort teardown
  }
});

/** Server-side fixture: 61 conversations, newest first. */
const SERVER_ROWS = Array.from({ length: TOTAL }, (_, i) => ({
  id: `conv_${String(i).padStart(3, '0')}`,
  type: 'direct',
  name: `Conversation ${i}`,
  avatarKey: null,
  members: [],
  lastMessageId: null,
  lastMessagePreview: `msg ${i}`,
  // Descending recency so index 0 sorts first.
  lastMessageAt: 2_000_000_000_000 - i * 1000,
  unreadCount: 0,
  pinned: false,
  archived: false,
  updatedAt: 2_000_000_000_000 - i * 1000,
}));

/** Stands in for GET /conversations?page=&limit= (same slicing as the backend). */
function serverPage(page: number, limit = CONVERSATION_PAGE_SIZE) {
  const skip = (page - 1) * limit;
  return {
    conversations: SERVER_ROWS.slice(skip, skip + limit),
    hasMore: skip + limit < TOTAL,
    total: TOTAL,
  };
}

/**
 * Mirrors the screen's fetch → upsert → loadFromDb cycle:
 * request a page, seed SQLite, then read back through the window.
 */
function fetchAndRead(state: PaginationState, reset: boolean) {
  const page = serverPage(requestPage(state, reset));
  const next = advancePagination(state, reset);
  repo.upsertMany(page.conversations);
  const rows = repo.list({ limit: dbReadLimit(next) });
  return { next, rows, hasMore: hasMoreFromWindow(next, page.total) };
}

describe('local-first conversation list paging against real SQLite', () => {
  it('surfaces all 61 conversations after paging to the end', () => {
    let state = INITIAL_PAGINATION_STATE;

    // Initial focus fetch (reset) — the 20-row symptom the user reported.
    let result = fetchAndRead(state, true);
    state = result.next;
    expect(result.rows.length).toBe(20);
    expect(result.hasMore).toBe(true);

    // Now page until the footer goes away.
    let guard = 0;
    while (result.hasMore) {
      if (++guard > 20) throw new Error('paging failed to terminate');
      result = fetchAndRead(state, false);
      state = result.next;
    }

    // Every conversation is now readable from SQLite.
    expect(result.rows.length).toBe(TOTAL);
    expect(result.hasMore).toBe(false);

    // No duplicates, and the full id set matches the server exactly.
    const ids = result.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(TOTAL);
    expect(new Set(ids)).toEqual(new Set(SERVER_ROWS.map((r) => r.id)));
  });

  it('keeps the list at 61 rows after a pull-to-refresh', () => {
    // Page all the way in first.
    let state = INITIAL_PAGINATION_STATE;
    let result = fetchAndRead(state, true);
    state = result.next;
    while (result.hasMore) {
      result = fetchAndRead(state, false);
      state = result.next;
    }
    expect(result.rows.length).toBe(TOTAL);

    // Refresh re-fetches page 1 only; the deeper rows live in SQLite and the
    // window must not shrink back to 20.
    const refreshed = fetchAndRead(state, true);
    expect(refreshed.rows.length).toBe(TOTAL);
    expect(refreshed.hasMore).toBe(false);
  });

  it('preserves list ordering across the whole window', () => {
    let state = INITIAL_PAGINATION_STATE;
    let result = fetchAndRead(state, true);
    state = result.next;
    while (result.hasMore) {
      result = fetchAndRead(state, false);
      state = result.next;
    }

    const times = result.rows.map((r) => Number(r.lastMessageAt));
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });

  it('reads the widened window within the repository performance budget', () => {
    // conversationRepository documents list({ limit: 50 }) ≤ 20 ms on a warm DB.
    // The window now exceeds 50, so confirm the larger read stays in budget.
    repo.upsertMany(SERVER_ROWS);
    const limit = dbReadLimit({ nextPage: 5, loadedPages: 4 }); // 80
    repo.list({ limit }); // warm
    const t0 = Date.now();
    const rows = repo.list({ limit });
    expect(Date.now() - t0).toBeLessThanOrEqual(20);
    expect(rows.length).toBe(TOTAL);
  });
});
