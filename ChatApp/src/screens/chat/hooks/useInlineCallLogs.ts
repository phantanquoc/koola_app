import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { callLogsApi } from '../../../services/api/apiService';
import type { CallLogEntry } from '../../../services/api/apiService';
import { webrtcService } from '../../../services/webrtc/WebRTCService';

export interface UseInlineCallLogsResult {
  callLogs: CallLogEntry[];
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

const LIMIT = 50;

/**
 * Terminal call events from webrtcService. The backend persists/updates the
 * call log before emitting any of these (webrtc.gateway createLog/updateLog),
 * so a reset fetch right after one fires will include the finished call's
 * inline card.
 */
const TERMINAL_CALL_EVENTS = [
  'call_ended',
  'call_missed',
  'call_declined',
  'call_cancelled',
  'call_busy',
  'call_failed',
  'call_timeout',
] as const;

/**
 * Trailing debounce for terminal-event refreshes. A single call can emit
 * several terminal events back-to-back (e.g. call_failed followed by
 * call_ended as the state machine unwinds); without coalescing each one
 * would trigger its own full reset fetch.
 */
const TERMINAL_REFRESH_DEBOUNCE_MS = 350;

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
    } catch (err) {
      console.warn('[useInlineCallLogs] fetch failed:', err);
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
  // Kept as a fallback — the primary inline-card refresh after a call is the
  // terminal-event subscription below. useFocusEffect is relied on only for
  // app-background → foreground return under presentation:'fullScreenModal'.
  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return;
      if (!hasInitialFetchedRef.current) return;
      void fetchPage(true);
    }, [conversationId, fetchPage]),
  );

  // Subscribe to terminal webrtc call events and do a reset fetch when any
  // fires. ChatScreen never blurs when CallModal/IncomingCallModal mounted as
  // presentation:'fullScreenModal', so useFocusEffect alone never re-fires
  // after the call — this is the real fix for BUG 1. Identical fetch to
  // `refresh` but debounced so a burst of terminal events emits one reset.
  // Effect re-registers (off old + on new) whenever fetchPage identity
  // changes, so the listener never captures a stale conversationId.
  useEffect(() => {
    if (!conversationId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleFetch = () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void fetchPage(true);
      }, TERMINAL_REFRESH_DEBOUNCE_MS);
    };

    // A single bound reference shared by every event. Re-created on each
    // effect invocation so `off` can match it; never recreated mid-registration.
    const handler = () => {
      scheduleFetch();
    };

    for (const ev of TERMINAL_CALL_EVENTS) {
      webrtcService.on(ev, handler);
    }

    return () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      for (const ev of TERMINAL_CALL_EVENTS) {
        webrtcService.off(ev, handler);
      }
    };
  }, [conversationId, fetchPage]);

  return { callLogs, loading, refreshing, refresh, hasMore, loadMore };
}

export default useInlineCallLogs;
