import { useState, useEffect, useCallback, useRef } from 'react';
import type { Business } from '../types';
import { businessesApi } from '../services/api/apiService';

interface BusinessFilters {
  relationshipType?: string;
  category?: string;
}

export function useBusinessList(filters: BusinessFilters) {
  const [items, setItems] = useState<Business[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (loading) return;
      setLoading(true);
      try {
        const params: Record<string, string | number> = { limit: 20 };
        if (filters.relationshipType && filters.relationshipType !== 'all') {
          params.relationshipType = filters.relationshipType;
        }
        if (filters.category && filters.category !== 'all') {
          params.category = filters.category;
        }
        if (!reset && cursor) {
          params.cursor = cursor;
        }

        const res = await businessesApi.list(params);
        if (!mountedRef.current) return;

        if (reset) {
          setItems(res.items);
        } else {
          setItems((prev) => [...prev, ...res.items]);
        }
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch (err) {
        console.warn('useBusinessList fetch error:', err);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [filters.relationshipType, filters.category, cursor, loading],
  );

  // Reset when filters change
  useEffect(() => {
    setCursor(null);
    setItems([]);
    setHasMore(false);
    // We need to fetch fresh — use a flag to indicate reset
    const doFetch = async () => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = { limit: 20 };
        if (filters.relationshipType && filters.relationshipType !== 'all') {
          params.relationshipType = filters.relationshipType;
        }
        if (filters.category && filters.category !== 'all') {
          params.category = filters.category;
        }
        const res = await businessesApi.list(params);
        if (!mountedRef.current) return;
        setItems(res.items);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch (err) {
        console.warn('useBusinessList fetch error:', err);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };
    doFetch();
  }, [filters.relationshipType, filters.category]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      fetchPage(false);
    }
  }, [hasMore, loading, fetchPage]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setCursor(null);
    const doRefresh = async () => {
      try {
        const params: Record<string, string | number> = { limit: 20 };
        if (filters.relationshipType && filters.relationshipType !== 'all') {
          params.relationshipType = filters.relationshipType;
        }
        if (filters.category && filters.category !== 'all') {
          params.category = filters.category;
        }
        const res = await businessesApi.list(params);
        if (!mountedRef.current) return;
        setItems(res.items);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch (err) {
        console.warn('useBusinessList refresh error:', err);
      } finally {
        if (mountedRef.current) {
          setRefreshing(false);
        }
      }
    };
    doRefresh();
  }, [filters.relationshipType, filters.category]);

  const updateItem = useCallback((id: string, updates: Partial<Business>) => {
    setItems((prev) =>
      prev.map((item) => (item._id === id ? { ...item, ...updates } : item)),
    );
  }, []);

  return { items, loading, refreshing, hasMore, loadMore, refresh, updateItem };
}
