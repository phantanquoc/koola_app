-- Migration 001: Initial schema
-- Creates messages, conversations, sync_state, schema_version, account_state tables
-- and all required indexes.
--
-- Column types mirror the backend Mongoose schema (message.schema.ts):
--   deleted: INTEGER (0/1) — mirrors Mongo `deleted: boolean`
--   deleted_for: TEXT (JSON array) — mirrors Mongo `deletedFor: string[]`
--   read_by: TEXT (JSON array) — mirrors Mongo `readBy: string[]`
--   media_thumbnail_key: TEXT nullable — mobile-only field, null when backend omits it

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

-- Hot-path index: paginated list newest-first per conversation
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages (conversation_id, created_at DESC);

-- Unique index for optimistic-message dedup by client_message_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_id
  ON messages (client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Sync-driven upsert index
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

-- Default sort: non-archived first, pinned first, then newest message
CREATE INDEX IF NOT EXISTS idx_conversations_list
  ON conversations (archived ASC, pinned DESC, last_message_at DESC);
