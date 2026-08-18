import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { callLogsApi } from '../../../services/api/apiService';
import type { CallLogEntry } from '../../../services/api/apiService';

export interface UseInlineCallLogsResult {
  callLogs: CallLogEntry[];
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

const LIMIT = 50;

export function useInlineCallLogs(conversationId: string, transitionDone = true): UseInlineCallLogsResult {
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);
  const mountedRef = useRef(true);
  const hasInitialFetchedRef = useRef(false);
  const lastConvIdRef = useRef<string | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchPage = useCallback(async (reset: boolean) => {
    if (!conversationId) return;
    if (reset) {
      pageRef.current = 1;
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const page = pageRef.current;
      const data = await callLogsApi.getHistory({
        conversationId,
        page,
        limit: LIMIT,
      });
      if (!mountedRef.current) return;
      if (reset) {
        setCallLogs(data.items);
        pageRef.current = 2;
      } else {
        setCallLogs((prev) => {
          const seen = new Set(prev.map((l) => l._id));
          const next = data.items.filter((l) => !seen.has(l._id));
          return [...prev, ...next];
        });
        pageRef.current += 1;
      }
      setHasMore(data.items.length === LIMIT && page * LIMIT < data.total);
    } catch {
      // silent — inline cards are secondary, messages remain visible
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [conversationId]);

  const refresh = useCallback(async () => {
    await fetchPage(true);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    await fetchPage(false);
  }, [fetchPage, loading, hasMore]);

  // Fetch on mount / conversation change — deferred until native transition ends.
  // The slide_from_right (150ms, react-native-screens) does NOT create an
  // InteractionManager handle, so deferring via InteractionManager would still
  // fire mid-animation. ChatScreen gates via `transitionDone` (transitionEnd +
  // 350ms fallback). Reset state on conversation switch immediately, but only
  // fetch when transitionDone is true.
  useEffect(() => {
    const convChanged = lastConvIdRef.current !== conversationId;
    if (convChanged) {
      setCallLogs([]);
      pageRef.current = 1;
      setHasMore(false);
      hasInitialFetchedRef.current = false;
      lastConvIdRef.current = conversationId;
    }
    if (!transitionDone) return;
    if (hasInitialFetchedRef.current) return;
    void fetchPage(true).then(() => { hasInitialFetchedRef.current = true; });
  }, [conversationId, transitionDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh on focus (covers return from background, after call_ended, etc.)
  // Skip the very first focus that coincides with mount to avoid double fetch.
  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return;
      if (!hasInitialFetchedRef.current) return;
      void fetchPage(true);
    }, [conversationId, fetchPage]),
  );

  return { callLogs, loading, refreshing, refresh, hasMore, loadMore };
}

export default useInlineCallLogs;
