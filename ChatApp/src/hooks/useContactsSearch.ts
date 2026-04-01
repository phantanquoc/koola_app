/**
 * useContactsSearch — manages user search state with loading/error/empty/pagination support.
 * Debouncing is handled by ContactSearchBar — this hook receives raw queries.
 */
import { useState, useCallback, useRef } from 'react';
import { usersApi } from '../services/api/apiService';
import type { User } from '../types';

export interface SearchResult extends User {}

export interface UseContactsSearchReturn {
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  search: (query: string) => Promise<void>;
  loadMore: () => Promise<void>;
  clear: () => void;
}

export function useContactsSearch(): UseContactsSearchReturn {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const lastQueryRef = useRef('');

  const search = useCallback(async (query: string) => {
    lastQueryRef.current = query;

    if (query.length < 2) {
      setResults([]);
      setError(null);
      setHasMore(false);
      setCursor(undefined);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCursor(undefined);

    try {
      const res = await usersApi.searchUsers(query);
      const data = res.data as { items: SearchResult[]; hasMore: boolean; nextCursor: string | null };
      setResults(data.items ?? []);
      setHasMore(data.hasMore ?? false);
      setCursor(data.nextCursor ?? undefined);
    } catch (err: any) {
      if (lastQueryRef.current !== query) return; // stale
      const message = err?.response?.data?.message ?? 'Search failed. Please try again.';
      setError(message);
      setResults([]);
      setHasMore(false);
    } finally {
      if (lastQueryRef.current === query) {
        setIsLoading(false);
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || !cursor) return;

    setIsLoading(true);
    const query = lastQueryRef.current;

    try {
      const res = await usersApi.searchUsers(query, cursor);
      const data = res.data as { items: SearchResult[]; hasMore: boolean; nextCursor: string | null };
      setResults((prev) => [...prev, ...(data.items ?? [])]);
      setHasMore(data.hasMore ?? false);
      setCursor(data.nextCursor ?? undefined);
    } catch (err: any) {
      const message = err?.response?.data?.message ?? 'Failed to load more results.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [hasMore, isLoading, cursor]);

  const clear = useCallback(() => {
    lastQueryRef.current = '';
    setResults([]);
    setError(null);
    setHasMore(false);
    setCursor(undefined);
  }, []);

  return { results, isLoading, error, hasMore, search, loadMore, clear };
}
