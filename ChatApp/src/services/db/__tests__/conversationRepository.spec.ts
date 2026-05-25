/**
 * conversationRepository.spec.ts
 *
 * Unit tests for conversationRepository.
 */

import { open } from '@op-engineering/op-sqlite';
import { _setDbForTesting } from '../connection';
import { runMigrations } from '../migrations';
import * as repo from '../conversationRepository';
import { clearAll as clearBroadcaster } from '../invalidationBroadcaster';

let db: ReturnType<typeof open>;

beforeEach(() => {
  db = open({ name: `test_conv_${Date.now()}` });
  _setDbForTesting(db as any);
  runMigrations();
  clearBroadcaster();
});

afterEach(() => {
  _setDbForTesting(null);
  try { (db as any).close?.(); } catch {}
});

function makeConv(overrides: Partial<Parameters<typeof repo.upsertMany>[0][0]> = {}) {
  return {
    id: `conv_${Math.random().toString(36).slice(2)}`,
    type: 'direct',
    name: null,
    avatarKey: null,
    members: [],
    lastMessagePreview: 'Hello',
    lastMessageAt: Date.now(),
    unreadCount: 0,
    pinned: false,
    archived: false,
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('conversationRepository.upsertMany', () => {
  it('inserts new conversations', () => {
    repo.upsertMany([makeConv({ id: 'c1' }), makeConv({ id: 'c2' })]);
    const result = repo.list();
    expect(result.length).toBe(2);
  });

  it('is idempotent', () => {
    const conv = makeConv({ id: 'idem_c1' });
    repo.upsertMany([conv]);
    repo.upsertMany([conv]);
    expect(repo.list().length).toBe(1);
  });

  it('updates existing rows on conflict', () => {
    const conv = makeConv({ id: 'upd_c1', lastMessagePreview: 'old' });
    repo.upsertMany([conv]);
    repo.upsertMany([{ ...conv, lastMessagePreview: 'new', unreadCount: 3 }]);
    const row = repo.getById('upd_c1');
    expect(row?.lastMessagePreview).toBe('new');
    expect(row?.unreadCount).toBe(3);
  });
});

describe('conversationRepository.list', () => {
  it('returns conversations sorted by last_message_at DESC', () => {
    const t = Date.now();
    repo.upsertMany([
      makeConv({ id: 'old_c', lastMessageAt: t - 5000 }),
      makeConv({ id: 'new_c', lastMessageAt: t }),
    ]);
    const result = repo.list();
    expect(result[0].id).toBe('new_c');
    expect(result[1].id).toBe('old_c');
  });

  it('respects limit and offset', () => {
    const convs = Array.from({ length: 10 }, (_, i) =>
      makeConv({ id: `page_c${i}`, lastMessageAt: Date.now() + i }),
    );
    repo.upsertMany(convs);
    const page1 = repo.list({ limit: 5, offset: 0 });
    const page2 = repo.list({ limit: 5, offset: 5 });
    expect(page1.length).toBe(5);
    expect(page2.length).toBe(5);
    // No overlap
    const ids1 = new Set(page1.map((c) => c.id));
    for (const c of page2) {
      expect(ids1.has(c.id)).toBe(false);
    }
  });
});

describe('conversationRepository.getById', () => {
  it('returns null for missing id', () => {
    expect(repo.getById('nonexistent')).toBeNull();
  });

  it('returns the correct conversation', () => {
    repo.upsertMany([makeConv({ id: 'find_me', name: 'Test Group' })]);
    const row = repo.getById('find_me');
    expect(row?.name).toBe('Test Group');
  });
});

describe('conversationRepository.wipeAll', () => {
  it('removes all rows', () => {
    repo.upsertMany([makeConv(), makeConv()]);
    repo.wipeAll();
    expect(repo.list().length).toBe(0);
  });
});

describe('conversationRepository performance budget', () => {
  it('list({ limit: 50 }) completes in ≤ 20 ms on warm DB', () => {
    const convs = Array.from({ length: 100 }, (_, i) =>
      makeConv({ id: `perf_c${i}`, lastMessageAt: Date.now() + i }),
    );
    repo.upsertMany(convs);
    // Warm
    repo.list({ limit: 50 });
    const t0 = Date.now();
    repo.list({ limit: 50 });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThanOrEqual(20);
  });
});
