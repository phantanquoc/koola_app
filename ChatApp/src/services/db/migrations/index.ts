/**
 * migrations/index.ts
 *
 * Forward-only migration runner.
 * Reads the current schema_version, applies pending migrations in order
 * inside a single transaction, and rolls back on any error.
 *
 * Migrations are idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
 * The schema_version table holds a single row with the current version integer.
 */
import { getDb } from '../connection';

// ─── Migration registry ───────────────────────────────────────────────────────
// Each entry is the SQL string for that migration step.
// Index 0 = migration 1 (schema_version 0 → 1), etc.

const MIGRATIONS: string[] = [
  // Migration 001 — initial schema
  `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS account_state (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY NOT NULL,
  last_synced_at TEXT,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  client_message_id TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL DEFAULT '',
  media_key TEXT,
  media_mime_type TEXT,
  media_size INTEGER,
  media_duration INTEGER,
  media_thumbnail_key TEXT,
  image_width INTEGER,
  image_height INTEGER,
  blurhash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_for TEXT NOT NULL DEFAULT '[]',
  read_by TEXT NOT NULL DEFAULT '[]',
  reactions TEXT NOT NULL DEFAULT '[]',
  reply_to TEXT,
  reply_to_preview TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages (conversation_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_id
  ON messages (client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conv_updated
  ON messages (conversation_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
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
);

CREATE INDEX IF NOT EXISTS idx_conversations_list
  ON conversations (archived ASC, pinned DESC, last_message_at DESC);
  `,
];

const CURRENT_VERSION = MIGRATIONS.length;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSchemaVersion(): number {
  const db = getDb();
  try {
    // Check if schema_version table exists first
    const tableCheck = db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'",
    );
    if (tableCheck.rows.length === 0) return 0;

    const result = db.execute('SELECT version FROM schema_version LIMIT 1');
    if (result.rows.length === 0) return 0;
    return (result.rows._array[0] as { version: number }).version;
  } catch {
    return 0;
  }
}

function setSchemaVersion(version: number): void {
  const db = getDb();
  const existing = db.execute('SELECT version FROM schema_version LIMIT 1');
  if (existing.rows.length === 0) {
    db.execute('INSERT INTO schema_version (version) VALUES (?)', [version]);
  } else {
    db.execute('UPDATE schema_version SET version = ?', [version]);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run all pending migrations.
 * Throws if a migration fails — caller should surface a recoverable error.
 */
export function runMigrations(): void {
  const db = getDb();
  const currentVersion = getSchemaVersion();

  if (currentVersion >= CURRENT_VERSION) {
    // Already up to date
    return;
  }

  // Apply each pending migration inside a single transaction
  for (let i = currentVersion; i < CURRENT_VERSION; i++) {
    const sql = MIGRATIONS[i];
    try {
      db.transaction(() => {
        // Split on semicolons and execute each statement individually
        // (op-sqlite executes one statement at a time)
        const statements = sql
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const stmt of statements) {
          db.execute(stmt);
        }

        setSchemaVersion(i + 1);
      });
    } catch (err) {
      throw new Error(
        `[migrations] Migration ${i + 1} failed: ${(err as Error).message}`,
      );
    }
  }
}
