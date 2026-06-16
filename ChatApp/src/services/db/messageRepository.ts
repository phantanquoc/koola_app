/**
 * messageRepository.ts
 *
 * Repository for the `messages` SQLite table.
 * All public functions return plain JS objects shaped for the existing
 * IMessage / Message view models. No raw SQL leaks to callers.
 *
 * Performance targets (warm DB, mid-range Android):
 *   list({ limit: 50 })        ≤ 20 ms
 *   upsertMany(N ≤ 500)        ≤ 200 ms
 *   applySocketEvent(event)    ≤ 5 ms
 */
import { getDb } from './connection';
import { notify, subscribe as broadcastSubscribe } from './invalidationBroadcaster';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_message_id: string | null;
  type: string;
  content: string;
  media_key: string | null;
  media_mime_type: string | null;
  media_size: number | null;
  media_duration: number | null;
  media_thumbnail_key: string | null;
  image_width: number | null;
  image_height: number | null;
  blurhash: string | null;
  created_at: number;
  updated_at: number;
  status: string;
  deleted: number; // 0 or 1
  deleted_for: string; // JSON array
  read_by: string; // JSON array
  reactions: string; // JSON array
  reply_to: string | null;
  reply_to_preview: string | null; // JSON object
}

export interface MessageInput {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId?: string | null;
  type?: string;
  content?: string;
  mediaKey?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  mediaDuration?: number | null;
  mediaThumbnailKey?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  blurhash?: string | null;
  createdAt: number | string | Date;
  updatedAt?: number | string | Date;
  status?: string;
  deleted?: boolean;
  deletedFor?: string[];
  readBy?: string[];
  reactions?: unknown[];
  replyTo?: string | null;
  replyToPreview?: unknown | null;
}

export interface SocketEvent {
  type: 'new_message' | 'message_ack' | 'message_deleted' | 'message_reaction' | 'message_updated';
  payload: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMs(val: number | string | Date | undefined | null): number {
  if (!val) return Date.now();
  if (typeof val === 'number') return val;
  return new Date(val).getTime();
}

function rowToInput(row: DbMessage): MessageInput {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    clientMessageId: row.client_message_id,
    type: row.type,
    content: row.content,
    mediaKey: row.media_key,
    mediaMimeType: row.media_mime_type,
    mediaSize: row.media_size,
    mediaDuration: row.media_duration,
    mediaThumbnailKey: row.media_thumbnail_key,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    blurhash: row.blurhash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    deleted: row.deleted === 1,
    deletedFor: JSON.parse(row.deleted_for || '[]'),
    readBy: JSON.parse(row.read_by || '[]'),
    reactions: JSON.parse(row.reactions || '[]'),
    replyTo: row.reply_to,
    replyToPreview: row.reply_to_preview ? JSON.parse(row.reply_to_preview) : null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List messages for a conversation, newest-first, excluding deleted rows.
 * Supports cursor-based pagination via `before` (created_at ms epoch).
 */
export function list(opts: {
  conversationId: string;
  currentUserId: string;
  limit?: number;
  before?: number;
}): MessageInput[] {
  const db = getDb();
  const limit = opts.limit ?? 50;

  let sql: string;
  let params: unknown[];

  if (opts.before != null) {
    sql = `
      SELECT * FROM messages
      WHERE conversation_id = ?
        AND deleted = 0
        AND deleted_for NOT LIKE ?
        AND created_at < ?
      ORDER BY created_at DESC
      LIMIT ?
    `;
    params = [opts.conversationId, `%"${opts.currentUserId}"%`, opts.before, limit];
  } else {
    sql = `
      SELECT * FROM messages
      WHERE conversation_id = ?
        AND deleted = 0
        AND deleted_for NOT LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `;
    params = [opts.conversationId, `%"${opts.currentUserId}"%`, limit];
  }

  const result = db.execute(sql, params);
  return (result.rows._array as DbMessage[]).map(rowToInput);
}

/**
 * Alias for list with before cursor (load-earlier path).
 */
export function listBefore(opts: {
  conversationId: string;
  currentUserId: string;
  before: number;
  limit?: number;
}): MessageInput[] {
  return list({ ...opts });
}

/**
 * Get a single message by id.
 */
export function getById(id: string): MessageInput | null {
  const db = getDb();
  const result = db.execute('SELECT * FROM messages WHERE id = ? LIMIT 1', [id]);
  if (result.rows.length === 0) return null;
  return rowToInput(result.rows._array[0] as DbMessage);
}

/**
 * Insert an optimistic (pending) message before backend ack.
 * id should be "temp_<clientMessageId>", status = "pending".
 */
export function insertOptimistic(msg: MessageInput): void {
  const db = getDb();
  const now = Date.now();
  db.execute(
    `INSERT OR IGNORE INTO messages (
      id, conversation_id, sender_id, client_message_id, type, content,
      media_key, media_mime_type, media_size, media_duration, media_thumbnail_key,
      image_width, image_height, blurhash,
      created_at, updated_at, status, deleted, deleted_for, read_by, reactions,
      reply_to, reply_to_preview
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      msg.id,
      msg.conversationId,
      msg.senderId,
      msg.clientMessageId ?? null,
      msg.type ?? 'text',
      msg.content ?? '',
      msg.mediaKey ?? null,
      msg.mediaMimeType ?? null,
      msg.mediaSize ?? null,
      msg.mediaDuration ?? null,
      msg.mediaThumbnailKey ?? null,
      msg.imageWidth ?? null,
      msg.imageHeight ?? null,
      msg.blurhash ?? null,
      toMs(msg.createdAt) || now,
      toMs(msg.updatedAt) || now,
      'pending',
      0,
      JSON.stringify(msg.deletedFor ?? []),
      JSON.stringify(msg.readBy ?? []),
      JSON.stringify(msg.reactions ?? []),
      msg.replyTo ?? null,
      msg.replyToPreview ? JSON.stringify(msg.replyToPreview) : null,
    ],
  );
  notify(msg.conversationId);
}

/**
 * Confirm a sent message: update the temp row to the real id and status.
 * Removes any duplicate row that may have been inserted by a racing socket event.
 */
export function confirmSend(opts: {
  tempId: string;
  realId: string;
  clientMessageId: string;
  serverFields?: Partial<MessageInput>;
}): void {
  const db = getDb();
  const { tempId, realId, clientMessageId, serverFields = {} } = opts;

  db.transaction(() => {
    // Only remove a duplicate real-id row when the temp row still exists.
    // If upsertMany already promoted the temp row to the real id (socket-before-REST
    // race handled in upsertMany), the temp row is gone and the real-id row IS the
    // promoted row — deleting it here would destroy the correct state.
    const tempExists = db.execute(
      'SELECT id FROM messages WHERE id = ? LIMIT 1',
      [tempId],
    ).rows.length > 0;
    if (tempExists) {
      db.execute('DELETE FROM messages WHERE id = ? AND id != ?', [realId, tempId]);
    }

    // Update the temp row (or the already-promoted real row) to the real id and
    // merge server fields. The WHERE covers both the old-world case (temp row still
    // present) and the new-world case (row already has realId after upsertMany
    // promotion, matched by client_message_id).
    db.execute(
      `UPDATE messages SET
        id = ?,
        status = 'sent',
        updated_at = ?,
        content = COALESCE(?, content),
        media_key = COALESCE(?, media_key),
        blurhash = COALESCE(?, blurhash),
        image_width = COALESCE(?, image_width),
        image_height = COALESCE(?, image_height)
      WHERE id = ? OR client_message_id = ?`,
      [
        realId,
        Date.now(),
        serverFields.content ?? null,
        serverFields.mediaKey ?? null,
        serverFields.blurhash ?? null,
        serverFields.imageWidth ?? null,
        serverFields.imageHeight ?? null,
        tempId,
        clientMessageId,
      ],
    );
  });

  // Get conversation_id for notification
  const row = getById(realId);
  if (row) notify(row.conversationId);
}

/**
 * Mark an optimistic message as failed.
 */
export function markFailed(tempId: string): void {
  const db = getDb();
  const row = getById(tempId);
  db.execute("UPDATE messages SET status = 'failed', updated_at = ? WHERE id = ?", [
    Date.now(),
    tempId,
  ]);
  if (row) notify(row.conversationId);
}

/**
 * Flip a failed message row back to 'pending' so the UI reflects the retry.
 * Called by the retry handler after markPendingForRetry on the outbox row.
 */
export function markPendingFromRetry(tempId: string): void {
  const db = getDb();
  const row = getById(tempId);
  db.execute("UPDATE messages SET status = 'pending', updated_at = ? WHERE id = ?", [
    Date.now(),
    tempId,
  ]);
  if (row) notify(row.conversationId);
}

/**
 * Upsert an array of messages from sync or socket events.
 * Runs inside a single transaction. Safe to retry.
 *
 * Optimistic reconciliation: when an incoming row carries a non-null
 * clientMessageId that already exists on a temp row with a different id
 * (the common socket-before-REST-response race), the temp row is updated
 * in place to the real id rather than attempting a fresh INSERT that would
 * violate the UNIQUE index on client_message_id.
 */
export function upsertMany(messages: MessageInput[]): void {
  if (messages.length === 0) return;
  const db = getDb();
  const affectedConvIds = new Set<string>();

  db.transaction(() => {
    for (const msg of messages) {
      const now = Date.now();

      // ── Optimistic reconciliation ──────────────────────────────────────────
      // If this message carries a clientMessageId, check whether a row with
      // the same clientMessageId but a different id already exists (i.e. the
      // optimistic temp row inserted by insertOptimistic before the server ack).
      // If found, UPDATE that row to the real id and merge server fields, then
      // skip the INSERT to avoid a UNIQUE constraint violation on
      // idx_messages_client_id.
      if (msg.clientMessageId != null) {
        const existing = db.execute(
          'SELECT id FROM messages WHERE client_message_id = ? AND id != ? LIMIT 1',
          [msg.clientMessageId, msg.id],
        );
        if (existing.rows.length > 0) {
          const existingId = (existing.rows._array[0] as { id: string }).id;

          // Remove any stale row that already carries the real id (double-delivery
          // guard — e.g. a previous upsertMany call already promoted the temp row).
          db.execute(
            'DELETE FROM messages WHERE id = ? AND id != ?',
            [msg.id, existingId],
          );

          // Promote the temp row: update its id to the real id and merge all
          // server-authoritative fields (mirrors confirmSend field list).
          db.execute(
            `UPDATE messages SET
              id = ?,
              status = ?,
              content = ?,
              media_key = COALESCE(?, media_key),
              media_mime_type = COALESCE(?, media_mime_type),
              media_size = COALESCE(?, media_size),
              media_duration = COALESCE(?, media_duration),
              media_thumbnail_key = COALESCE(?, media_thumbnail_key),
              image_width = COALESCE(?, image_width),
              image_height = COALESCE(?, image_height),
              blurhash = COALESCE(?, blurhash),
              deleted = ?,
              deleted_for = ?,
              read_by = ?,
              reactions = ?,
              updated_at = ?
            WHERE id = ?`,
            [
              msg.id,
              msg.status ?? 'sent',
              msg.content ?? '',
              msg.mediaKey ?? null,
              msg.mediaMimeType ?? null,
              msg.mediaSize ?? null,
              msg.mediaDuration ?? null,
              msg.mediaThumbnailKey ?? null,
              msg.imageWidth ?? null,
              msg.imageHeight ?? null,
              msg.blurhash ?? null,
              msg.deleted ? 1 : 0,
              JSON.stringify(msg.deletedFor ?? []),
              JSON.stringify(msg.readBy ?? []),
              JSON.stringify(msg.reactions ?? []),
              toMs(msg.updatedAt) || now,
              existingId,
            ],
          );

          affectedConvIds.add(msg.conversationId);
          continue; // skip the INSERT below — reconciliation is complete
        }
      }
      // ── End optimistic reconciliation ─────────────────────────────────────

      db.execute(
        `INSERT INTO messages (
          id, conversation_id, sender_id, client_message_id, type, content,
          media_key, media_mime_type, media_size, media_duration, media_thumbnail_key,
          image_width, image_height, blurhash,
          created_at, updated_at, status, deleted, deleted_for, read_by, reactions,
          reply_to, reply_to_preview
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          content = excluded.content,
          status = excluded.status,
          deleted = excluded.deleted,
          deleted_for = excluded.deleted_for,
          read_by = excluded.read_by,
          reactions = excluded.reactions,
          updated_at = excluded.updated_at,
          media_key = COALESCE(excluded.media_key, media_key),
          media_mime_type = COALESCE(excluded.media_mime_type, media_mime_type),
          media_size = COALESCE(excluded.media_size, media_size),
          media_duration = COALESCE(excluded.media_duration, media_duration),
          media_thumbnail_key = COALESCE(excluded.media_thumbnail_key, media_thumbnail_key),
          image_width = COALESCE(excluded.image_width, image_width),
          image_height = COALESCE(excluded.image_height, image_height),
          blurhash = COALESCE(excluded.blurhash, blurhash),
          reply_to = COALESCE(excluded.reply_to, reply_to),
          reply_to_preview = COALESCE(excluded.reply_to_preview, reply_to_preview)`,
        [
          msg.id,
          msg.conversationId,
          msg.senderId,
          msg.clientMessageId ?? null,
          msg.type ?? 'text',
          msg.content ?? '',
          msg.mediaKey ?? null,
          msg.mediaMimeType ?? null,
          msg.mediaSize ?? null,
          msg.mediaDuration ?? null,
          msg.mediaThumbnailKey ?? null,
          msg.imageWidth ?? null,
          msg.imageHeight ?? null,
          msg.blurhash ?? null,
          toMs(msg.createdAt) || now,
          toMs(msg.updatedAt) || now,
          msg.status ?? 'sent',
          msg.deleted ? 1 : 0,
          JSON.stringify(msg.deletedFor ?? []),
          JSON.stringify(msg.readBy ?? []),
          JSON.stringify(msg.reactions ?? []),
          msg.replyTo ?? null,
          msg.replyToPreview ? JSON.stringify(msg.replyToPreview) : null,
        ],
      );
      affectedConvIds.add(msg.conversationId);
    }
  });

  for (const convId of affectedConvIds) {
    notify(convId);
  }
}

/**
 * Apply a socket event to the local database.
 * Idempotent — safe to call multiple times with the same event.
 */
export function applySocketEvent(event: SocketEvent): void {
  const db = getDb();
  const { type, payload } = event;

  switch (type) {
    case 'new_message': {
      const msg = (payload.message ?? payload) as Record<string, unknown>;
      const input: MessageInput = {
        id: String(msg._id ?? msg.id ?? ''),
        conversationId: String(msg.conversationId ?? ''),
        senderId: String(msg.senderId ?? ''),
        clientMessageId: (msg.clientMessageId as string) ?? null,
        type: String(msg.type ?? 'text'),
        content: String(msg.content ?? ''),
        mediaKey: (msg.mediaUrl as string) ?? null,
        mediaMimeType: (msg.mediaMimeType as string) ?? null,
        mediaSize: (msg.mediaSize as number) ?? null,
        mediaDuration: (msg.mediaDuration as number) ?? null,
        mediaThumbnailKey: (msg.mediaThumbnailKey as string) ?? null,
        imageWidth: (msg.imageWidth as number) ?? null,
        imageHeight: (msg.imageHeight as number) ?? null,
        blurhash: (msg.blurhash as string) ?? null,
        createdAt: toMs(msg.createdAt as string | number | Date),
        updatedAt: toMs((msg.updatedAt ?? msg.createdAt) as string | number | Date),
        status: String(msg.status ?? 'sent'),
        deleted: Boolean(msg.deleted),
        deletedFor: (msg.deletedFor as string[]) ?? [],
        readBy: (msg.readBy as string[]) ?? [],
        reactions: (msg.reactions as unknown[]) ?? [],
        replyTo: (msg.replyTo as string) ?? null,
        replyToPreview: (msg.replyToPreview as unknown) ?? null,
      };
      if (!input.id) return;
      upsertMany([input]);
      break;
    }

    case 'message_ack': {
      const ack = payload as Record<string, unknown>;
      const clientMessageId = String(ack.clientMessageId ?? '');
      const realId = String(ack.messageId ?? ack._id ?? '');
      if (!clientMessageId || !realId) return;
      confirmSend({
        tempId: `temp_${clientMessageId}`,
        realId,
        clientMessageId,
        serverFields: {},
      });
      break;
    }

    case 'message_deleted': {
      const del = payload as { messageId: string; conversationId?: string };
      const row = getById(del.messageId);
      if (!row) {
        // Row not yet in DB — insert a tombstone stub so that when the real
        // new_message arrives later, the upsert sees deleted=1 and does not
        // resurrect the message.
        const convId = del.conversationId ?? '';
        if (del.messageId && convId) {
          const now = Date.now();
          db.execute(
            `INSERT OR IGNORE INTO messages (
              id, conversation_id, sender_id, client_message_id, type, content,
              media_key, media_mime_type, media_size, media_duration, media_thumbnail_key,
              image_width, image_height, blurhash,
              created_at, updated_at, status, deleted, deleted_for, read_by, reactions,
              reply_to, reply_to_preview
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              del.messageId, convId, '', null, 'text', '',
              null, null, null, null, null, null, null, null,
              now, now, 'sent', 1, '[]', '[]', '[]', null, null,
            ],
          );
          notify(convId);
        }
        return;
      }
      db.execute(
        "UPDATE messages SET deleted = 1, updated_at = ? WHERE id = ?",
        [Date.now(), del.messageId],
      );
      const convId = del.conversationId ?? row?.conversationId;
      if (convId) notify(convId);
      break;
    }

    case 'message_reaction': {
      const react = payload as {
        messageId: string;
        conversationId: string;
        userId: string;
        emoji: string;
        action: 'add' | 'remove';
      };
      let row = getById(react.messageId);
      if (!row) {
        // Row not yet in DB — insert a stub so the reaction is not lost.
        // The stub will be merged with the real row when new_message arrives.
        const now = Date.now();
        db.execute(
          `INSERT OR IGNORE INTO messages (
            id, conversation_id, sender_id, client_message_id, type, content,
            media_key, media_mime_type, media_size, media_duration, media_thumbnail_key,
            image_width, image_height, blurhash,
            created_at, updated_at, status, deleted, deleted_for, read_by, reactions,
            reply_to, reply_to_preview
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            react.messageId, react.conversationId, '', null, 'text', '',
            null, null, null, null, null, null, null, null,
            now, now, 'sent', 0, '[]', '[]', '[]', null, null,
          ],
        );
        row = getById(react.messageId);
        if (!row) return; // should not happen, but guard anyway
      }
      const reactions = (row.reactions as Array<{ userId: string; emoji: string }>) ?? [];
      if (react.action === 'remove') {
        const idx = reactions.findIndex(
          (r) => r.userId === react.userId && r.emoji === react.emoji,
        );
        if (idx >= 0) reactions.splice(idx, 1);
      } else {
        const idx = reactions.findIndex((r) => r.userId === react.userId);
        if (idx >= 0) {
          reactions[idx] = { userId: react.userId, emoji: react.emoji };
        } else {
          reactions.push({ userId: react.userId, emoji: react.emoji });
        }
      }
      db.execute(
        'UPDATE messages SET reactions = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(reactions), Date.now(), react.messageId],
      );
      notify(react.conversationId);
      break;
    }

    case 'message_updated': {
      const upd = payload as {
        messageId: string;
        conversationId: string;
        blurhash?: string;
        imageWidth?: number;
        imageHeight?: number;
      };
      // If the row doesn't exist yet, insert a stub with the supplied fields
      // so the update is not lost when the real new_message arrives later.
      const existing = getById(upd.messageId);
      if (!existing) {
        const now = Date.now();
        db.execute(
          `INSERT OR IGNORE INTO messages (
            id, conversation_id, sender_id, client_message_id, type, content,
            media_key, media_mime_type, media_size, media_duration, media_thumbnail_key,
            image_width, image_height, blurhash,
            created_at, updated_at, status, deleted, deleted_for, read_by, reactions,
            reply_to, reply_to_preview
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            upd.messageId, upd.conversationId, '', null, 'text', '',
            null, null, null, null, null,
            upd.imageWidth ?? null, upd.imageHeight ?? null, upd.blurhash ?? null,
            now, now, 'sent', 0, '[]', '[]', '[]', null, null,
          ],
        );
        notify(upd.conversationId);
        return;
      }
      db.execute(
        `UPDATE messages SET
          blurhash = COALESCE(?, blurhash),
          image_width = COALESCE(?, image_width),
          image_height = COALESCE(?, image_height),
          updated_at = ?
        WHERE id = ?`,
        [
          upd.blurhash ?? null,
          upd.imageWidth ?? null,
          upd.imageHeight ?? null,
          Date.now(),
          upd.messageId,
        ],
      );
      notify(upd.conversationId);
      break;
    }
  }
}

/**
 * Soft-delete a message for the current user (adds userId to deleted_for).
 */
export function softDeleteForUser(messageId: string, userId: string): void {
  const db = getDb();
  const row = getById(messageId);
  if (!row) return;
  const deletedFor = (row.deletedFor as string[]) ?? [];
  if (!deletedFor.includes(userId)) {
    deletedFor.push(userId);
  }
  db.execute(
    'UPDATE messages SET deleted_for = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(deletedFor), Date.now(), messageId],
  );
  notify(row.conversationId);
}

/**
 * Subscribe to invalidations for a conversation.
 * Returns an unsubscribe function.
 */
export function subscribe(
  conversationId: string,
  callback: () => void,
): () => void {
  return broadcastSubscribe(conversationId, callback);
}

/**
 * Hard-delete a single message row by id.
 * Used by the Discard handler to permanently remove a temp/failed message.
 */
export function deleteById(id: string): void {
  const db = getDb();
  const row = getById(id);
  db.execute('DELETE FROM messages WHERE id = ?', [id]);
  if (row) notify(row.conversationId);
}

/**
 * Delete all message rows. Used on logout.
 */
export function wipeAll(): void {
  const db = getDb();
  db.execute('DELETE FROM messages');
}
