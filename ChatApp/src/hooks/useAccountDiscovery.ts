import { useState, useEffect, useCallback, useRef } from 'react';
import type { BusinessAccountItem } from '../services/api/apiService';
import { accountDiscoveryApi } from '../services/api/apiService';
import type { BusinessSort } from '../types';

interface AccountDiscoveryFilters {
  relationshipType?: string;
  businessCategory?: string;
  sort?: BusinessSort;
  province?: string;
}

export function useAccountDiscovery(filters: AccountDiscoveryFilters) {
  const [items, setItems] = useState<BusinessAccountItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  // Monotonic id; every initial fetch / refresh bumps it. Stale responses
  // whose id !== current are dropped (last-call-wins). loadMore captures
  // the active id at call-time and only commits if it still matches.
  const reqIdRef = useRef(0);
  // Tracks whether a loadMore is in flight so concurrent loadMore calls
  // don't fan out into duplicate page fetches.
  const loadingMoreRef = useRef(false);

  const buildParams = useCallback(() => {
    const params: Record<string, string | number> = { limit: 20 };
    if (filters.relationshipType && filters.relationshipType !== 'all') {
      params.relationshipType = filters.relationshipType;
    }
    if (filters.businessCategory && filters.businessCategory !== 'all') {
      params.businessCategory = filters.businessCategory;
    }
    if (filters.sort && filters.sort !== 'latest') {
      params.sort = filters.sort;
    }
    if (filters.province) {
      params.province = filters.province;
    }
    return params;
  }, [filters.relationshipType, filters.businessCategory, filters.sort, filters.province]);

  // Fetch on filter change. Always issues a new request and ignores any
  // older in-flight responses via the reqId guard.
  useEffect(() => {
    const myId = ++reqIdRef.current;
    loadingMoreRef.current = false;

    setCursor(null);
    setItems([]);
    setHasMore(false);
    setLoading(true);

    (async () => {
      try {
        const res = await accountDiscoveryApi.list(buildParams());
        if (!mountedRef.current || reqIdRef.current !== myId) return;
        setError(null);
        setItems(res.items);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch (err: any) {
        if (!mountedRef.current || reqIdRef.current !== myId) return;
        if (__DEV__) console.warn('[useAccountDiscovery] fetch error:', err?.message);
        setError('Không thể tải dữ liệu');
      } finally {
        if (mountedRef.current && reqIdRef.current === myId) {
          setLoading(false);
        }
      }
    })();
  }, [buildParams]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || !cursor) return;
    const myId = reqIdRef.current;
    loadingMoreRef.current = true;
    setLoading(true);
    try {
      const params = buildParams();
      params.cursor = cursor;
      const res = await accountDiscoveryApi.list(params);
      if (!mountedRef.current || reqIdRef.current !== myId) return;
      setError(null);
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err: any) {
      if (!mountedRef.current || reqIdRef.current !== myId) return;
      if (__DEV__) console.warn('[useAccountDiscovery] loadMore error:', err?.message);
      setError('Không thể tải dữ liệu');
    } finally {
      if (mountedRef.current && reqIdRef.current === myId) {
        setLoading(false);
      }
      loadingMoreRef.current = false;
    }
  }, [hasMore, cursor, buildParams]);

  const refresh = useCallback(async () => {
    const myId = ++reqIdRef.current;
    loadingMoreRef.current = false;
    setRefreshing(true);
    setCursor(null);
    try {
      const res = await accountDiscoveryApi.list(buildParams());
      if (!mountedRef.current || reqIdRef.current !== myId) return;
      setError(null);
      setItems(res.items);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err: any) {
      if (!mountedRef.current || reqIdRef.current !== myId) return;
      if (__DEV__) console.warn('[useAccountDiscovery] refresh error:', err?.message);
      setError('Không thể tải dữ liệu');
    } finally {
      if (mountedRef.current && reqIdRef.current === myId) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [buildParams]);

  return { items, loading, refreshing, hasMore, error, loadMore, refresh };
}
