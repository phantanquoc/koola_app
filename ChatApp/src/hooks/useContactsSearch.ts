import { useState, useCallback, useRef } from 'react';
import { usersApi } from '../services/api/apiService';
import type { UserSearchResult } from '../types';

export function useContactsSearch() {
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const lastQueryRef = useRef<string>('');

  const search = useCallback(async (query: string) => {
    lastQueryRef.current = query;

    if (query.length < 2) {
      setResults([]);
      setError(null);
      setHasMore(false);
      cursorRef.current = null;
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await usersApi.searchUsers(query);
      if (lastQueryRef.current !== query) return; // Stale request
      setResults(data.items);
      setHasMore(data.hasMore);
      cursorRef.current = data.nextCursor;
    } catch {
      setError('Search failed. Tap to retry.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || !cursorRef.current) return;

    setIsLoading(true);
    try {
      const data = await usersApi.searchUsers(lastQueryRef.current, cursorRef.current);
      setResults((prev) => [...prev, ...data.items]);
      setHasMore(data.hasMore);
      cursorRef.current = data.nextCursor;
    } catch {
      // Silent fail on load more
    } finally {
      setIsLoading(false);
    }
  }, [hasMore, isLoading]);

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
    setHasMore(false);
    cursorRef.current = null;
    lastQueryRef.current = '';
  }, []);

  return { results, isLoading, error, hasMore, search, loadMore, clear };
}
