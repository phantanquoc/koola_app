import { useState, useEffect, useCallback, useRef } from 'react';
import type { Business, BusinessSort } from '../types';
import { businessesApi } from '../services/api/apiService';

interface BusinessFilters {
  relationshipType?: string;
  category?: string;
  sort?: BusinessSort;
  province?: string;
}

export function useBusinessList(filters: BusinessFilters) {
  const [items, setItems] = useState<Business[]>([]);
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
    if (filters.category && filters.category !== 'all') {
      params.category = filters.category;
    }
    if (filters.sort && filters.sort !== 'latest') {
      params.sort = filters.sort;
    }
    if (filters.province) {
      params.province = filters.province;
    }
    return params;
  }, [filters.relationshipType, filters.category, filters.sort, filters.province]);

  // Reset when filters change
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
        const res = await businessesApi.list(params);
        if (!mountedRef.current) return;
        setError(null);
        setItems(res.items);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch (err: any) {
        console.warn('useBusinessList fetch error:', err);
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
      const res = await businessesApi.list(params);
      if (!mountedRef.current) return;
      setError(null);
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err: any) {
      console.warn('useBusinessList loadMore error:', err);
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
      const res = await businessesApi.list(params);
      if (!mountedRef.current) return;
      setError(null);
      setItems(res.items);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err: any) {
      console.warn('useBusinessList refresh error:', err);
      if (mountedRef.current) {
        setError(err?.message || 'Không thể tải dữ liệu');
      }
    } finally {
      if (mountedRef.current) setRefreshing(false);
      fetchingRef.current = false;
    }
  }, [buildParams]);

  const updateItem = useCallback((id: string, updates: Partial<Business>) => {
    setItems((prev) =>
      prev.map((item) => (item._id === id ? { ...item, ...updates } : item)),
    );
  }, []);

  return { items, loading, refreshing, hasMore, error, loadMore, refresh, updateItem };
}
