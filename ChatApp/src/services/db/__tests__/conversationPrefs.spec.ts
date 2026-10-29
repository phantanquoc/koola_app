/**
 * conversationPrefs.spec.ts
 *
 * conversation-quick-actions data layer (task 7.1):
 * - REST seed keeps server pinned / mutedUntil / clearedAt (no reset to defaults)
 * - updatePrefs writes prefs columns and notifies the list
 * - clearForMe deletes only messages/call-logs at or before the cutoff,
 *   deletes the row, and leaves pending outbox rows untouched
 * - migration 004 adds muted_until / cleared_at on an existing DB
 */

import { open } from '@op-engineering/op-sqlite';
import { getDb, _setDbForTesting } from '../connection';
import { runMigrations } from '../migrations';
import * as repo from '../conversationRepository';
import * as messageRepo from '../messageRepository';
import * as callLogRepo from '../callLogRepository';
import { clearAll as clearBroadcaster, subscribe } from '../invalidationBroadcaster';

let db: ReturnType<typeof open>;
let _dbCounter = 0;

beforeEach(() => {
  _dbCounter++;
  db = open({ name: `test_conv_prefs_${_dbCounter}` });
  _setDbForTesting(db as any);
  runMigrations();
  clearBroadcaster();
});

afterEach(() => {
  _setDbForTesting(null);
  try { (db as any).close?.(); } catch {}
});

function makeConv(overrides: Partial<repo.ConversationInput> = {}) {
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

describe('seed keeps server prefs', () => {
  it('upsertMany writes pinned / mutedUntil / clearedAt instead of defaults', () => {
    const mutedUntil = Date.now() + 8 * 3600_000;
    const clearedAt = Date.now() - 1000;
    repo.upsertMany([
      makeConv({ id: 'seed_c', pinned: true, mutedUntil, clearedAt }),
    ]);
    const row = repo.getById('seed_c');
    expect(row?.pinned).toBe(true);
    expect(row?.mutedUntil).toBe(mutedUntil);
    expect(row?.clearedAt).toBe(clearedAt);
  });

  it('a refresh without prefs fields wipes them only when the server says so (explicit values win)', () => {
    // Server is authoritative: when it returns pinned:false the row unpins.
    repo.upsertMany([makeConv({ id: 'refresh_c', pinned: true })]);
    expect(repo.getById('refresh_c')?.pinned).toBe(true);
    repo.upsertMany([makeConv({ id: 'refresh_c', pinned: false })]);
    expect(repo.getById('refresh_c')?.pinned).toBe(false);
  });
});

describe('updatePrefs', () => {
  it('updates pinned and muted_until and notifies the list', async () => {
    repo.upsertMany([makeConv({ id: 'pin_c' })]);
    let notified = 0;
    const unsub = subscribe('__conversations__', () => { notified++; });
    try {
      repo.updatePrefs('pin_c', { pinned: true });
      expect(repo.getById('pin_c')?.pinned).toBe(true);
      repo.updatePrefs('pin_c', { mutedUntil: Date.now() + 3600_000 });
      expect(repo.getById('pin_c')?.mutedUntil).toBeGreaterThan(0);
      // Broadcaster flushes on a microtask; the two writes coalesce to one call.
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      expect(notified).toBe(1);
    } finally {
      unsub();
    }
  });

  it('mutedUntil null clears the mute', () => {
    repo.upsertMany([makeConv({ id: 'mute_c', mutedUntil: Date.now() + 3600_000 })]);
    repo.updatePrefs('mute_c', { mutedUntil: null });
    expect(repo.getById('mute_c')?.mutedUntil).toBe(0);
  });

  it('no-op when nothing is given', () => {
    repo.upsertMany([makeConv({ id: 'noop_c', pinned: true })]);
    repo.updatePrefs('noop_c', {});
    expect(repo.getById('noop_c')?.pinned).toBe(true);
  });
});

describe('clearForMe', () => {
  it('deletes only messages/call-logs at or before the cutoff and drops the row', () => {
    const T0 = 1_700_000_000_000;
    const convId = 'clear_c';
    repo.upsertMany([makeConv({ id: convId, pinned: true, unreadCount: 5 })]);

    messageRepo.upsertMany([
      { id: 'm_old', conversationId: convId, senderId: 'u1', content: 'old', createdAt: T0 - 1000 },
      { id: 'm_edge', conversationId: convId, senderId: 'u1', content: 'edge', createdAt: T0 },
      { id: 'm_new', conversationId: convId, senderId: 'u1', content: 'new', createdAt: T0 + 1000 },
    ]);
    callLogRepo.upsertMany([
      { id: 'log_old', sessionId: 's_old', conversationId: convId, initiatorId: 'u1', targetUserId: 'u2', callType: 'audio', status: 'ended', startedAt: T0 - 500 },
      { id: 'log_new', sessionId: 's_new', conversationId: convId, initiatorId: 'u1', targetUserId: 'u2', callType: 'audio', status: 'ended', startedAt: T0 + 500 },
    ]);
    // A pending outbox row for the same conversation must survive.
    getDb().execute(
      `INSERT INTO outbox (id, op_type, payload_version, payload_json, conversation_id, state, retry_count, next_retry_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ['ob1', 'send_message', 1, '{}', convId, 'pending', 0, 0, T0, T0],
    );

    repo.clearForMe(convId, T0);

    expect(repo.getById(convId)).toBeNull();
    expect(messageRepo.getById('m_old')).toBeNull();
    expect(messageRepo.getById('m_edge')).toBeNull();
    expect(messageRepo.getById('m_new')).not.toBeNull();
    expect(callLogRepo.getById('log_old')).toBeNull();
    expect(callLogRepo.getById('log_new')).not.toBeNull();
    const ob = getDb().execute('SELECT id FROM outbox WHERE id = ?', ['ob1']);
    expect(ob.rows.length).toBe(1);
  });

  it('leaves other conversations untouched', () => {
    const T0 = 1_700_000_000_000;
    repo.upsertMany([makeConv({ id: 'clear_a' }), makeConv({ id: 'clear_b' })]);
    messageRepo.upsertMany([
      { id: 'ma', conversationId: 'clear_a', senderId: 'u1', content: 'a', createdAt: T0 - 1 },
      { id: 'mb', conversationId: 'clear_b', senderId: 'u1', content: 'b', createdAt: T0 - 1 },
    ]);
    repo.clearForMe('clear_a', T0);
    expect(repo.getById('clear_b')).not.toBeNull();
    expect(messageRepo.getById('mb')).not.toBeNull();
  });
});

describe('migration 004 on an existing v3 DB', () => {
  function buildV3Db() {
    const v3 = open({ name: `test_conv_prefs_v3_${_dbCounter}_${Math.random()}` });
    _setDbForTesting(v3 as any);
    // Minimal v3 shape: schema_version=3 + conversations table without the
    // 004 columns, holding one pre-existing row.
    v3.execute('CREATE TABLE schema_version (version INTEGER NOT NULL)');
    v3.execute('INSERT INTO schema_version (version) VALUES (3)');
    v3.execute(`CREATE TABLE conversations (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL DEFAULT 'direct',
      name TEXT,
      avatar_key TEXT,
      members TEXT NOT NULL DEFAULT '[]',
      last_message_id TEXT,
      last_message_preview TEXT,
      last_message_at INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )`);
    v3.execute(
      `INSERT INTO conversations (id, pinned, unread_count) VALUES ('legacy_c', 1, 4)`,
    );
    return v3;
  }

  it('adds muted_until / cleared_at with default 0 and preserves rows', () => {
    const v3 = buildV3Db();
    try {
      runMigrations();

      // Behavioural proof that 004 applied: writing the new columns works
      // (it would throw "no such column" on a v3 schema) and old rows read
      // back as unmuted / never-cleared.
      const before = repo.getById('legacy_c');
      expect(before?.pinned).toBe(true);
      expect(before?.unreadCount).toBe(4);
      expect(before?.mutedUntil).toBe(0);
      expect(before?.clearedAt).toBe(0);

      const mutedUntil = Date.now() + 3600_000;
      const clearedAt = Date.now() - 1000;
      repo.upsertMany([
        makeConv({
          id: 'legacy_c',
          pinned: true,
          unreadCount: 4,
          mutedUntil,
          clearedAt,
        }),
      ]);
      const row = repo.getById('legacy_c');
      expect(row?.pinned).toBe(true);
      expect(row?.unreadCount).toBe(4);
      expect(row?.mutedUntil).toBe(mutedUntil);
      expect(row?.clearedAt).toBe(clearedAt);

      const ver = getDb().execute('SELECT version FROM schema_version LIMIT 1');
      expect((ver.rows._array[0] as { version: number }).version).toBe(4);
    } finally {
      try { (v3 as any).close?.(); } catch {}
      _setDbForTesting(db as any);
    }
  });
});
