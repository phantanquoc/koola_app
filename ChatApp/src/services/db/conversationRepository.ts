/**
 * conversationRepository.ts
 *
 * Repository for the `conversations` SQLite table.
 * Returns plain JS objects shaped for the existing Conversation view model.
 *
 * Performance target: list({ limit: 50 }) ≤ 20 ms on warm DB.
 */
import { getDb } from './connection';
import { notify, subscribe as broadcastSubscribe } from './invalidationBroadcaster';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbConversation {
  id: string;
  type: string;
  name: string | null;
  avatar_key: string | null;
  members: string; // JSON array
  last_message_id: string | null;
  last_message_preview: string | null;
  last_message_at: number;
  unread_count: number;
  pinned: number; // 0 or 1
  archived: number; // 0 or 1
  updated_at: number;
}

export interface ConversationInput {
  id: string;
  type?: string;
  name?: string | null;
  avatarKey?: string | null;
  members?: unknown[];
  lastMessageId?: string | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: number | string | Date;
  unreadCount?: number;
  pinned?: boolean;
  archived?: boolean;
  updatedAt?: number | string | Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMs(val: number | string | Date | undefined | null): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  return new Date(val).getTime();
}

function rowToInput(row: DbConversation): ConversationInput {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    avatarKey: row.avatar_key,
    members: JSON.parse(row.members || '[]'),
    lastMessageId: row.last_message_id,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    updatedAt: row.updated_at,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List conversations with default sort: non-archived, pinned first, newest last message.
 * Supports offset-based pagination to match the existing page-based backend API.
 */
export function list(opts: { limit?: number; offset?: number } = {}): ConversationInput[] {
  const db = getDb();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const result = db.execute(
    `SELECT * FROM conversations
     ORDER BY archived ASC, pinned DESC, last_message_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return (result.rows._array as DbConversation[]).map(rowToInput);
}

/**
 * Get a single conversation by id.
 */
export function getById(id: string): ConversationInput | null {
  const db = getDb();
  const result = db.execute('SELECT * FROM conversations WHERE id = ? LIMIT 1', [id]);
  if (result.rows.length === 0) return null;
  return rowToInput(result.rows._array[0] as DbConversation);
}

/**
 * Upsert an array of conversations from sync or REST response.
 * Runs inside a single transaction. Safe to retry.
 */
export function upsertMany(conversations: ConversationInput[]): void {
  if (conversations.length === 0) return;
  const db = getDb();

  db.transaction(() => {
    for (const conv of conversations) {
      db.execute(
        `INSERT INTO conversations (
          id, type, name, avatar_key, members,
          last_message_id, last_message_preview, last_message_at,
          unread_count, pinned, archived, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          name = COALESCE(excluded.name, name),
          avatar_key = COALESCE(excluded.avatar_key, avatar_key),
          members = excluded.members,
          last_message_id = COALESCE(excluded.last_message_id, last_message_id),
          last_message_preview = COALESCE(excluded.last_message_preview, last_message_preview),
          last_message_at = MAX(excluded.last_message_at, last_message_at),
          unread_count = excluded.unread_count,
          pinned = excluded.pinned,
          archived = excluded.archived,
          updated_at = excluded.updated_at`,
        [
          conv.id,
          conv.type ?? 'direct',
          conv.name ?? null,
          conv.avatarKey ?? null,
          JSON.stringify(conv.members ?? []),
          conv.lastMessageId ?? null,
          conv.lastMessagePreview ?? null,
          toMs(conv.lastMessageAt),
          conv.unreadCount ?? 0,
          conv.pinned ? 1 : 0,
          conv.archived ? 1 : 0,
          toMs(conv.updatedAt) || Date.now(),
        ],
      );
    }
  });

  // Notify with a special key for conversation list changes
  notify('__conversations__');
}

/**
 * Subscribe to conversation list invalidations.
 * Returns an unsubscribe function.
 */
export function subscribe(callback: () => void): () => void {
  return broadcastSubscribe('__conversations__', callback);
}

/**
 * Delete all conversation rows. Used on logout.
 */
export function wipeAll(): void {
  const db = getDb();
  db.execute('DELETE FROM conversations');
}
