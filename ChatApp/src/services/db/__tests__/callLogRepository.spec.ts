/**
 * callLogRepository.spec.ts
 */
import { open } from '@op-engineering/op-sqlite';
import { _setDbForTesting } from '../connection';
import { runMigrations } from '../migrations';
import * as repo from '../callLogRepository';
import { clearAll as clearBroadcaster } from '../invalidationBroadcaster';

let db: ReturnType<typeof open>;

beforeEach(() => {
  db = open({ name: `test_call_logs_${Date.now()}_${Math.random()}` });
  _setDbForTesting(db as any);
  runMigrations();
  clearBroadcaster();
});

afterEach(() => {
  _setDbForTesting(null);
  try { (db as any).close?.(); } catch {}
});

function makeLog(overrides: Partial<import('../callLogRepository').CallLogInput> = {}): import('../callLogRepository').CallLogInput {
  const now = Date.now();
  return {
    id: `call_${Math.random().toString(36).slice(2)}`,
    sessionId: `sess_${Math.random().toString(36).slice(2)}`,
    conversationId: 'conv_1',
    initiatorId: 'user_1',
    targetUserId: 'user_2',
    callType: 'audio',
    status: 'ended',
    startedAt: now,
    answeredAt: now,
    endedAt: now + 60000,
    duration: 60,
    ...overrides,
  };
}

describe('callLogRepository.list', () => {
  it('returns newest-first', () => {
    const t = Date.now();
    repo.upsertMany([makeLog({ id: 'old', startedAt: t - 2000 }), makeLog({ id: 'new', startedAt: t })]);
    const rows = repo.list({ conversationId: 'conv_1' });
    expect(rows[0].id).toBe('new');
    expect(rows[1].id).toBe('old');
  });
  it('respects limit', () => {
    repo.upsertMany(Array.from({ length: 20 }, (_, i) => makeLog({ id: `lim_${i}`, startedAt: Date.now() + i })));
    expect(repo.list({ conversationId: 'conv_1', limit: 10 }).length).toBe(10);
  });
  it('listBefore paginates by started_at cursor', () => {
    const t = Date.now();
    const items = Array.from({ length: 20 }, (_, i) => makeLog({ id: `page_${i}`, startedAt: t + i * 1000 }));
    repo.upsertMany(items);
    const p1 = repo.list({ conversationId: 'conv_1', limit: 10 });
    const oldest = p1[p1.length - 1].startedAt as number;
    const p2 = repo.listBefore({ conversationId: 'conv_1', before: oldest, limit: 10 });
    expect(p2.length).toBe(10);
    for (const r of p2) expect(r.startedAt as number).toBeLessThan(oldest);
  });
  it('list ≤20ms for warm DB (mock harness)', () => {
    repo.upsertMany(Array.from({ length: 100 }, (_, i) => makeLog({ id: `perf_${i}`, startedAt: Date.now() + i })));
    const t0 = Date.now();
    repo.list({ conversationId: 'conv_1', limit: 50 });
    expect(Date.now() - t0).toBeLessThanOrEqual(20);
  });
});

describe('callLogRepository.upsertMany', () => {
  it('inserts and is idempotent', () => {
    const logs = [makeLog({ id: 'a' }), makeLog({ id: 'b' })];
    repo.upsertMany(logs);
    repo.upsertMany(logs);
    expect(repo.list({ conversationId: 'conv_1' }).length).toBe(2);
  });
  it('updates on conflict', () => {
    repo.upsertMany([makeLog({ id: 'upd', status: 'missed' })]);
    repo.upsertMany([makeLog({ id: 'upd', status: 'ended', duration: 120 })]);
    expect(repo.getById('upd')?.status).toBe('ended');
  });
});

describe('callLogRepository.subscribe', () => {
  it('fires for same conversation', async () => {
    let fired = 0;
    const unsub = repo.subscribe('conv_1', () => { fired++; });
    repo.upsertMany([makeLog({ conversationId: 'conv_1' })]);
    await Promise.resolve(); // flush microtask broadcaster
    expect(fired).toBe(1);
    unsub();
  });
  it('does not fire for unrelated conversation', async () => {
    let fired = 0;
    const unsub = repo.subscribe('conv_1', () => { fired++; });
    repo.upsertMany([makeLog({ conversationId: 'conv_other' })]);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(fired).toBe(0);
    unsub();
  });
  it('unmount unsubscribes', async () => {
    let fired = 0;
    const unsub = repo.subscribe('conv_1', () => { fired++; });
    unsub();
    repo.upsertMany([makeLog({ conversationId: 'conv_1' })]);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(fired).toBe(0);
  });
});

describe('callLogRepository.wipeAll', () => {
  it('clears all rows', () => {
    repo.upsertMany([makeLog(), makeLog()]);
    repo.wipeAll();
    expect(repo.list({ conversationId: 'conv_1' }).length).toBe(0);
  });
});
