import { useCallback, useEffect, useState } from 'react';
import type { CallLogEntry } from '../../../services/api/apiService';
import * as callLogRepository from '../../../services/db/callLogRepository';
import type { CallLogInput } from '../../../services/db/callLogRepository';
import { syncCallLogsOnOpen } from '../../../services/sync/syncOrchestrator';

export interface UseInlineCallLogsResult {
  callLogs: CallLogEntry[];
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

const LIMIT = 50;

function toEntry(row: CallLogInput): CallLogEntry {
  return {
    _id: row.id,
    sessionId: row.sessionId,
    initiatorId: row.initiatorId,
    targetUserId: row.targetUserId,
    conversationId: row.conversationId,
    callType: row.callType,
    status: row.status,
    startedAt: new Date(row.startedAt as number).toISOString(),
    answeredAt: row.answeredAt != null ? new Date(row.answeredAt as number).toISOString() : null,
    endedAt: row.endedAt != null ? new Date(row.endedAt as number).toISOString() : null,
    duration: row.duration ?? 0,
  };
}

function readFromDb(conversationId: string, limit = LIMIT): CallLogEntry[] {
  if (!conversationId) return [];
  try {
    const rows = callLogRepository.list({ conversationId, limit });
    return rows.map(toEntry);
  } catch {
    return [];
  }
}

export function useInlineCallLogs(
  conversationId: string,
  _transitionDone = true,
): UseInlineCallLogsResult {
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>(() => readFromDb(conversationId));
  const [hasMore, setHasMore] = useState(false);

  const reload = useCallback(() => {
    if (!conversationId) {
      setCallLogs([]);
      setHasMore(false);
      return;
    }
    try {
      // Single LIMIT+1 query determines both page and hasMore
      const rows = callLogRepository.list({ conversationId, limit: LIMIT + 1 });
      setHasMore(rows.length > LIMIT);
      setCallLogs(rows.slice(0, LIMIT).map(toEntry));
    } catch {
      setCallLogs([]);
      setHasMore(false);
    }
  }, [conversationId]);

  // Re-read synchronously when conversation changes (initializer only runs once)
  useEffect(() => {
    reload();
  }, [reload]);

  // Subscribe to SQLite invalidations
  useEffect(() => {
    if (!conversationId) return;
    const unsub = callLogRepository.subscribe(conversationId, () => {
      reload();
    });
    return unsub;
  }, [conversationId, reload]);

  // Background sync off the critical path (never blocks first paint)
  useEffect(() => {
    if (!conversationId) return;
    void syncCallLogsOnOpen(conversationId);
  }, [conversationId]);

  const loadMore = useCallback(async () => {
    if (!hasMore || callLogs.length === 0) return;
    const oldest = new Date(callLogs[callLogs.length - 1].startedAt).getTime();
    try {
      const older = callLogRepository.listBefore({ conversationId, before: oldest, limit: LIMIT });
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      setCallLogs((prev) => [...prev, ...older.map(toEntry)]);
      if (older.length < LIMIT) setHasMore(false);
      else {
        const lastOldest = older[older.length - 1].startedAt as number;
        const check = callLogRepository.list({ conversationId, limit: 1, before: lastOldest });
        setHasMore(check.length > 0);
      }
    } catch (err) {
      console.warn('[useInlineCallLogs] loadMore failed:', err);
    }
  }, [conversationId, callLogs, hasMore]);

  const refresh = useCallback(async () => {
    await syncCallLogsOnOpen(conversationId, { force: true });
    reload();
  }, [conversationId, reload]);

  return { callLogs, loading: false, refreshing: false, refresh, hasMore, loadMore };
}

export default useInlineCallLogs;
