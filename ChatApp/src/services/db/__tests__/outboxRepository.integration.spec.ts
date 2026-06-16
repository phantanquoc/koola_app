/**
 * outboxRepository.integration.spec.ts
 *
 * Integration tests using better-sqlite3 (real SQLite engine).
 * Tests schema-critical paths that the in-memory mock cannot verify:
 *   - Partial unique index UNIQUE violation
 *   - json_extract on payload_json
 *   - CHECK constraint rejection
 *   - Nested transaction error handling
 *   - ON CONFLICT UPSERT atomicity
 *
 * These tests run via `npm run test:integration` (separate jest config).
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// ─── Schema SQL (mirrors migrations/index.ts migration 002) ──────────────────

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS account_state (key TEXT PRIMARY KEY NOT NULL, value TEXT);
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY NOT NULL,
  last_synced_at TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  client_message_id TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_for TEXT NOT NULL DEFAULT '[]',
  read_by TEXT NOT NULL DEFAULT '[]',
  reactions TEXT NOT NULL DEFAULT '[]',
  reply_to TEXT,
  reply_to_preview TEXT,
  media_key TEXT, media_mime_type TEXT, media_size INTEGER,
  media_duration INTEGER, media_thumbnail_key TEXT,
  image_width INTEGER, image_height INTEGER, blurhash TEXT
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL DEFAULT 'direct',
  name TEXT, avatar_key TEXT,
  members TEXT NOT NULL DEFAULT '[]',
  last_message_id TEXT, last_message_preview TEXT,
  last_message_at INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
`;

const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS outbox (
  id              TEXT    PRIMARY KEY NOT NULL,
  op_type         TEXT    NOT NULL,
  payload_version INTEGER NOT NULL DEFAULT 1,
  payload_json    TEXT    NOT NULL,
  conversation_id TEXT    NOT NULL,
  message_id      TEXT,
  dedup_key       TEXT,
  state           TEXT    NOT NULL DEFAULT 'pending'
                  CHECK (state IN ('pending','in_flight','done','dead_letter')),
  retry_count     INTEGER NOT NULL DEFAULT 0,
  next_retry_at   INTEGER NOT NULL DEFAULT 0,
  in_flight_at    INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_error      TEXT,
  last_error_at   INTEGER
);

CREATE TABLE IF NOT EXISTS outbox_metrics (
  key        TEXT    PRIMARY KEY NOT NULL,
  value      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_outbox_due
  ON outbox (state, next_retry_at, conversation_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_dedup
  ON outbox (op_type, dedup_key)
  WHERE dedup_key IS NOT NULL AND state IN ('pending','in_flight');

CREATE INDEX IF NOT EXISTS idx_outbox_in_flight
  ON outbox (state, in_flight_at)
  WHERE state = 'in_flight';
`;

// ─── Setup ────────────────────────────────────────────────────────────────────

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `outbox_integration_${Date.now()}.db`);
  db = new Database(dbPath);
  // Apply schema
  db.exec(SCHEMA_V1);
  db.exec(SCHEMA_V2);
});

afterEach(() => {
  db.close();
  try { fs.unlinkSync(dbPath); } catch {}
});

const NOW = 1_700_000_000_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function insertOutbox(opts: {
  id: string;
  op_type: string;
  payload_json: string;
  conversation_id: string;
  dedup_key?: string | null;
  state?: string;
  message_id?: string | null;
}) {
  const now = NOW;
  db.prepare(
    `INSERT INTO outbox (id, op_type, payload_json, conversation_id, dedup_key, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.id,
    opts.op_type,
    opts.payload_json,
    opts.conversation_id,
    opts.dedup_key ?? null,
    opts.state ?? 'pending',
    now,
    now,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('integration — partial unique index', () => {
  it('allows two rows with same (op_type, dedup_key) when one is done', () => {
    insertOutbox({ id: 'id1', op_type: 'react', payload_json: '{}', conversation_id: 'conv1', dedup_key: 'msg1+user1', state: 'done' });
    // Should not throw — done rows are excluded from the partial unique index
    expect(() => {
      insertOutbox({ id: 'id2', op_type: 'react', payload_json: '{}', conversation_id: 'conv1', dedup_key: 'msg1+user1', state: 'pending' });
    }).not.toThrow();
  });

  it('rejects duplicate (op_type, dedup_key) when both are pending', () => {
    insertOutbox({ id: 'id1', op_type: 'react', payload_json: '{}', conversation_id: 'conv1', dedup_key: 'msg1+user1', state: 'pending' });
    expect(() => {
      insertOutbox({ id: 'id2', op_type: 'react', payload_json: '{}', conversation_id: 'conv1', dedup_key: 'msg1+user1', state: 'pending' });
    }).toThrow();
  });

  it('rejects duplicate (op_type, dedup_key) when one is in_flight', () => {
    insertOutbox({ id: 'id1', op_type: 'react', payload_json: '{}', conversation_id: 'conv1', dedup_key: 'msg1+user1', state: 'in_flight' });
    expect(() => {
      insertOutbox({ id: 'id2', op_type: 'react', payload_json: '{}', conversation_id: 'conv1', dedup_key: 'msg1+user1', state: 'pending' });
    }).toThrow();
  });

  it('allows NULL dedup_key rows to coexist freely', () => {
    insertOutbox({ id: 'id1', op_type: 'send_message', payload_json: '{}', conversation_id: 'conv1', dedup_key: null });
    insertOutbox({ id: 'id2', op_type: 'send_message', payload_json: '{}', conversation_id: 'conv1', dedup_key: null });
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM outbox').get() as { cnt: number }).cnt;
    expect(count).toBe(2);
  });
});

describe('integration — json_extract on payload_json', () => {
  it('extracts replyTo from payload_json', () => {
    const payload = JSON.stringify({ conversationId: 'conv1', clientMessageId: 'cmi1', replyTo: 'temp_parent123' });
    insertOutbox({ id: 'id1', op_type: 'send_message', payload_json: payload, conversation_id: 'conv1' });
    const row = db.prepare(
      `SELECT json_extract(payload_json, '$.replyTo') as reply_to FROM outbox WHERE id = ?`,
    ).get('id1') as { reply_to: string };
    expect(row.reply_to).toBe('temp_parent123');
  });

  it('returns NULL for missing replyTo field', () => {
    const payload = JSON.stringify({ conversationId: 'conv1', clientMessageId: 'cmi1' });
    insertOutbox({ id: 'id1', op_type: 'send_message', payload_json: payload, conversation_id: 'conv1' });
    const row = db.prepare(
      `SELECT json_extract(payload_json, '$.replyTo') as reply_to FROM outbox WHERE id = ?`,
    ).get('id1') as { reply_to: string | null };
    expect(row.reply_to).toBeNull();
  });

  it('filters out temp_ replyTo rows using json_extract in WHERE', () => {
    const tempPayload = JSON.stringify({ conversationId: 'conv1', clientMessageId: 'r1', replyTo: 'temp_parent' });
    const realPayload = JSON.stringify({ conversationId: 'conv1', clientMessageId: 'r2', replyTo: 'real_id' });
    const noReplyPayload = JSON.stringify({ conversationId: 'conv1', clientMessageId: 'r3' });
    insertOutbox({ id: 'id1', op_type: 'send_message', payload_json: tempPayload, conversation_id: 'conv1' });
    insertOutbox({ id: 'id2', op_type: 'send_message', payload_json: realPayload, conversation_id: 'conv1' });
    insertOutbox({ id: 'id3', op_type: 'send_message', payload_json: noReplyPayload, conversation_id: 'conv1' });

    const rows = db.prepare(
      `SELECT id FROM outbox
       WHERE state = 'pending'
         AND (
           json_extract(payload_json, '$.replyTo') IS NULL
           OR json_extract(payload_json, '$.replyTo') NOT LIKE 'temp_%'
         )`,
    ).all() as { id: string }[];

    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain('id1');
    expect(ids).toContain('id2');
    expect(ids).toContain('id3');
  });
});

describe('integration — CHECK constraint', () => {
  it('rejects invalid state value', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO outbox (id, op_type, payload_json, conversation_id, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('id1', 'send_message', '{}', 'conv1', 'garbage', NOW, NOW);
    }).toThrow();
  });

  it('accepts all valid state values', () => {
    for (const [idx, state] of ['pending', 'in_flight', 'done', 'dead_letter'].entries()) {
      expect(() => {
        db.prepare(
          `INSERT INTO outbox (id, op_type, payload_json, conversation_id, state, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(`id${idx}`, 'send_message', '{}', 'conv1', state, NOW, NOW);
      }).not.toThrow();
    }
  });
});

describe('integration — nested transaction behavior', () => {
  it('throws on nested BEGIN (no silent corruption)', () => {
    // better-sqlite3 uses the same BEGIN/COMMIT model as op-sqlite shim
    expect(() => {
      db.exec('BEGIN');
      try {
        db.exec('BEGIN'); // should throw
      } finally {
        try { db.exec('ROLLBACK'); } catch {}
      }
    }).toThrow();
  });
});

describe('integration — ON CONFLICT UPSERT atomicity', () => {
  it('upserts mark_read with MAX(upToTimestamp)', () => {
    const payload1 = JSON.stringify({ conversationId: 'conv1', upToTimestamp: 1000 });
    const payload2 = JSON.stringify({ conversationId: 'conv1', upToTimestamp: 2000 });

    db.prepare(
      `INSERT INTO outbox (id, op_type, payload_json, conversation_id, dedup_key, state, created_at, updated_at)
       VALUES (?, 'mark_read', ?, 'conv1', 'conv1', 'pending', ?, ?)`,
    ).run('id1', payload1, NOW, NOW);

    db.prepare(
      `INSERT INTO outbox (id, op_type, payload_json, conversation_id, dedup_key, state, created_at, updated_at)
       VALUES (?, 'mark_read', ?, 'conv1', 'conv1', 'pending', ?, ?)
       ON CONFLICT(op_type, dedup_key)
         WHERE dedup_key IS NOT NULL AND state IN ('pending','in_flight')
       DO UPDATE SET
         payload_json = CASE
           WHEN json_extract(excluded.payload_json, '$.upToTimestamp') >
                json_extract(outbox.payload_json, '$.upToTimestamp')
           THEN excluded.payload_json
           ELSE outbox.payload_json
         END,
         updated_at = excluded.updated_at`,
    ).run('id2', payload2, NOW + 1, NOW + 1);

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM outbox').get() as { cnt: number }).cnt;
    expect(count).toBe(1);

    const row = db.prepare('SELECT payload_json FROM outbox WHERE id = ?').get('id1') as { payload_json: string };
    const payload = JSON.parse(row.payload_json) as { upToTimestamp: number };
    expect(payload.upToTimestamp).toBe(2000);
  });

  it('does not downgrade upToTimestamp on upsert', () => {
    const payload1 = JSON.stringify({ conversationId: 'conv1', upToTimestamp: 5000 });
    const payload2 = JSON.stringify({ conversationId: 'conv1', upToTimestamp: 100 });

    db.prepare(
      `INSERT INTO outbox (id, op_type, payload_json, conversation_id, dedup_key, state, created_at, updated_at)
       VALUES (?, 'mark_read', ?, 'conv1', 'conv1', 'pending', ?, ?)`,
    ).run('id1', payload1, NOW, NOW);

    db.prepare(
      `INSERT INTO outbox (id, op_type, payload_json, conversation_id, dedup_key, state, created_at, updated_at)
       VALUES (?, 'mark_read', ?, 'conv1', 'conv1', 'pending', ?, ?)
       ON CONFLICT(op_type, dedup_key)
         WHERE dedup_key IS NOT NULL AND state IN ('pending','in_flight')
       DO UPDATE SET
         payload_json = CASE
           WHEN json_extract(excluded.payload_json, '$.upToTimestamp') >
                json_extract(outbox.payload_json, '$.upToTimestamp')
           THEN excluded.payload_json
           ELSE outbox.payload_json
         END,
         updated_at = excluded.updated_at`,
    ).run('id2', payload2, NOW + 1, NOW + 1);

    const row = db.prepare('SELECT payload_json FROM outbox WHERE id = ?').get('id1') as { payload_json: string };
    const payload = JSON.parse(row.payload_json) as { upToTimestamp: number };
    expect(payload.upToTimestamp).toBe(5000);
  });
});
