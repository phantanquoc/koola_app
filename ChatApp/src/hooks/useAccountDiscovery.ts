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
  const fetchingRef = useRef(false);

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

  // Fetch on filter change
  useEffect(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    setCursor(null);
    setItems([]);
    setHasMore(false);
    setLoading(true);

    const doFetch = async () => {
      try {
        const params = buildParams();
        const res = await accountDiscoveryApi.list(params);
        if (!mountedRef.current) return;
        setError(null);
        setItems(res.items);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch (err: any) {
        if (mountedRef.current) {
          setError(err?.message || 'Không thể tải dữ liệu');
        }
      } finally {
        if (mountedRef.current) setLoading(false);
        fetchingRef.current = false;
      }
    };
    doFetch();
  }, [buildParams]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || fetchingRef.current || !cursor) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const params = buildParams();
      params.cursor = cursor;
      const res = await accountDiscoveryApi.list(params);
      if (!mountedRef.current) return;
      setError(null);
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.message || 'Không thể tải dữ liệu');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
      fetchingRef.current = false;
    }
  }, [hasMore, cursor, buildParams]);

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setRefreshing(true);
    setCursor(null);
    try {
      const params = buildParams();
      const res = await accountDiscoveryApi.list(params);
      if (!mountedRef.current) return;
      setError(null);
      setItems(res.items);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.message || 'Không thể tải dữ liệu');
      }
    } finally {
      if (mountedRef.current) setRefreshing(false);
      fetchingRef.current = false;
    }
  }, [buildParams]);

  return { items, loading, refreshing, hasMore, error, loadMore, refresh };
}
