/**
 * callLogRepository.ts
 *
 * Repository for the `call_logs` SQLite table.
 * Mirrors messageRepository — callers never write raw SQL.
 *
 * Hot-path budget (warm DB): list({limit:50}) ≤ 20 ms; upsertMany(≤50) ≤ 100 ms.
 */
import { getDb } from './connection';
import { notify, subscribe as broadcastSubscribe, InvalidationPayload } from './invalidationBroadcaster';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbCallLog {
  id: string;
  session_id: string;
  conversation_id: string;
  initiator_id: string;
  target_user_id: string;
  call_type: string;
  status: string;
  started_at: number;
  answered_at: number | null;
  ended_at: number | null;
  duration: number;
  created_at: number | null;
  updated_at: number | null;
}

export type CallLogStatus = 'answered' | 'ended' | 'missed' | 'declined' | 'busy' | 'failed' | 'cancelled';
export type CallLogType = 'audio' | 'video';

export interface CallLogInput {
  id: string;
  sessionId: string;
  conversationId: string;
  initiatorId: string;
  targetUserId: string;
  callType: CallLogType;
  status: CallLogStatus;
  startedAt: number | string | Date;
  answeredAt?: number | string | Date | null;
  endedAt?: number | string | Date | null;
  duration?: number;
  createdAt?: number | string | Date | null;
  updatedAt?: number | string | Date | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMs(val: number | string | Date | null | undefined): number | null {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return val;
  const ms = new Date(val as string | Date).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function rowToInput(row: DbCallLog): CallLogInput {
  return {
    id: row.id,
    sessionId: row.session_id,
    conversationId: row.conversation_id,
    initiatorId: row.initiator_id,
    targetUserId: row.target_user_id,
    callType: row.call_type as CallLogType,
    status: row.status as CallLogStatus,
    startedAt: row.started_at,
    answeredAt: row.answered_at,
    endedAt: row.ended_at,
    duration: row.duration ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function list(opts: {
  conversationId: string;
  limit?: number;
  before?: number;
}): CallLogInput[] {
  const db = getDb();
  const limit = opts.limit ?? 50;
  let sql: string;
  let params: unknown[];
  if (opts.before != null) {
    sql = `SELECT * FROM call_logs WHERE conversation_id = ? AND started_at < ? ORDER BY started_at DESC LIMIT ?`;
    params = [opts.conversationId, opts.before, limit];
  } else {
    sql = `SELECT * FROM call_logs WHERE conversation_id = ? ORDER BY started_at DESC LIMIT ?`;
    params = [opts.conversationId, limit];
  }
  const result = db.execute(sql, params);
  return (result.rows._array as DbCallLog[]).map(rowToInput);
}

export function listBefore(opts: {
  conversationId: string;
  before: number;
  limit?: number;
}): CallLogInput[] {
  return list({ ...opts });
}

export function getById(id: string): CallLogInput | null {
  const db = getDb();
  const result = db.execute('SELECT * FROM call_logs WHERE id = ? LIMIT 1', [id]);
  if (result.rows.length === 0) return null;
  return rowToInput(result.rows._array[0] as DbCallLog);
}

export function upsertMany(items: CallLogInput[]): void {
  if (items.length === 0) return;
  const db = getDb();
  const affectedConvIds = new Set<string>();
  const idsByConv = new Map<string, string[]>();

  db.transaction(() => {
    for (const it of items) {
      const now = Date.now();
      const startedMs = toMs(it.startedAt) ?? now;
      db.execute(
        `INSERT INTO call_logs (
          id, session_id, conversation_id, initiator_id, target_user_id,
          call_type, status, started_at, answered_at, ended_at, duration,
          created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          call_type = excluded.call_type,
          started_at = excluded.started_at,
          answered_at = excluded.answered_at,
          ended_at = excluded.ended_at,
          duration = excluded.duration,
          updated_at = excluded.updated_at,
          session_id = excluded.session_id,
          conversation_id = excluded.conversation_id,
          initiator_id = excluded.initiator_id,
          target_user_id = excluded.target_user_id`,
        [
          it.id,
          it.sessionId,
          it.conversationId,
          it.initiatorId,
          it.targetUserId,
          it.callType,
          it.status,
          startedMs,
          toMs(it.answeredAt),
          toMs(it.endedAt),
          it.duration ?? 0,
          toMs(it.createdAt),
          toMs(it.updatedAt) ?? now,
        ],
      );
      affectedConvIds.add(it.conversationId);
      let arr = idsByConv.get(it.conversationId);
      if (!arr) { arr = []; idsByConv.set(it.conversationId, arr); }
      arr.push(it.id);
    }
  });

  for (const convId of affectedConvIds) {
    const ids = idsByConv.get(convId) ?? [];
    if (ids.length === 0) continue;
    const kind: InvalidationPayload['kind'] = ids.length > 1 ? 'batch' : 'insert';
    notify(convId, {
      conversationId: convId,
      kind,
      messageIds: ids,
      orderChanged: true,
    });
  }
}

export function subscribe(
  conversationId: string,
  callback: (payload: InvalidationPayload | undefined) => void,
): () => void {
  return broadcastSubscribe(conversationId, callback);
}

export function wipeAll(): void {
  const db = getDb();
  db.execute('DELETE FROM call_logs');
}

export interface PruneCallLogOptions {
  maxAgeDays?: number;
  minPerConversation?: number;
}

export function pruneOldCallLogs(opts: PruneCallLogOptions = {}): number {
  const maxAgeDays = opts.maxAgeDays ?? 90;
  const minPerConversation = opts.minPerConversation ?? 200;
  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const db = getDb();
  let totalDeleted = 0;
  db.transaction(() => {
    const oldRows = db.execute(`SELECT id, conversation_id FROM call_logs WHERE started_at < ?`, [cutoffMs]);
    const oldArray = oldRows.rows._array as Array<{ id: string; conversation_id: string }>;
    if (oldArray.length === 0) return;
    const convOldIds = new Map<string, string[]>();
    for (const r of oldArray) {
      let arr = convOldIds.get(r.conversation_id);
      if (!arr) { arr = []; convOldIds.set(r.conversation_id, arr); }
      arr.push(r.id);
    }
    for (const [convId, oldIds] of convOldIds) {
      const totalResult = db.execute(`SELECT id FROM call_logs WHERE conversation_id = ?`, [convId]);
      if (totalResult.rows.length <= minPerConversation) continue;
      const keepResult = db.execute(
        `SELECT id FROM call_logs WHERE conversation_id = ? ORDER BY started_at DESC LIMIT ?`,
        [convId, minPerConversation],
      );
      const keepSet = new Set((keepResult.rows._array as Array<{ id: string }>).map((r) => r.id));
      for (const id of oldIds) {
        if (keepSet.has(id)) continue;
        const res = db.execute(`DELETE FROM call_logs WHERE id = ?`, [id]);
        totalDeleted += res.rowsAffected;
      }
    }
  });
  return totalDeleted;
}
