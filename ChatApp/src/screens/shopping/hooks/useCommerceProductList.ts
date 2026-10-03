import { useCallback, useEffect, useRef, useState } from 'react';
import {
  commerceApi,
  type ProductCard,
  type ProductListParams,
} from '../../../services/api/apiService';

/**
 * Server-driven product list with infinite scroll (commerce-catalog D10).
 *
 * - Any param change → reset to page 1 (the old list stays until the new
 *   response lands, then is REPLACED — no mixing of two filters' rows).
 * - `loadMore` is guarded by an in-flight ref AND `hasMore`, so a burst of
 *   onEndReached calls never fetches the same page twice.
 * - Appending dedupes by id (defends against a product shifting pages when
 *   data changes between requests).
 * - Stale-response guard: every request carries a sequence number; a slower
 *   older response (previous filter) is dropped instead of overwriting the
 *   newer one. In-flight requests are also aborted.
 */

export type ProductListStatus =
  | 'initialLoading'
  | 'ready'
  | 'empty'
  | 'error'
  | 'loadingMore'
  | 'loadMoreError';

export type ProductListQuery = Omit<ProductListParams, 'page' | 'limit'>;

export interface UseCommerceProductListResult {
  items: ProductCard[];
  status: ProductListStatus;
  total: number;
  hasMore: boolean;
  /** True while a page-1 refetch runs over an already-shown list. */
  refreshing: boolean;
  loadMore: () => void;
  /** Re-run the failed request (first page or the next page). */
  retry: () => void;
  /** Pull-to-refresh: refetch page 1 for the current params. */
  refresh: () => void;
}

const DEFAULT_LIMIT = 20;

export interface UseCommerceProductListOptions {
  limit?: number;
  /** When false no request is made (e.g. before first interaction settles). */
  enabled?: boolean;
}

function paramsKey(p: ProductListQuery): string {
  return JSON.stringify([
    p.q?.trim() || '',
    p.category ?? '',
    p.tag ?? '',
    p.sellerId ?? '',
    p.sort ?? '',
  ]);
}

export function useCommerceProductList(
  query: ProductListQuery,
  options: UseCommerceProductListOptions = {},
): UseCommerceProductListResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const enabled = options.enabled ?? true;
  const key = paramsKey(query);

  const [items, setItems] = useState<ProductCard[]>([]);
  const [status, setStatus] = useState<ProductListStatus>('initialLoading');
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const seqRef = useRef(0);
  const inFlightRef = useRef(false);
  const pageRef = useRef(0);
  const hasMoreRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;
  const itemCountRef = useRef(0);

  const fetchPage = useCallback(
    async (page: number, mode: 'reset' | 'append') => {
      const seq = ++seqRef.current;
      abortRef.current?.abort();
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      abortRef.current = controller;
      inFlightRef.current = true;

      if (mode === 'append') setStatus('loadingMore');
      else if (itemCountRef.current === 0) setStatus('initialLoading');
      else setRefreshing(true);

      const q = queryRef.current;
      try {
        const res = await commerceApi.listProducts(
          {
            q: q.q?.trim() || undefined,
            category: q.category,
            tag: q.tag,
            sellerId: q.sellerId,
            sort: q.sort,
            page,
            limit,
          },
          { signal: controller?.signal },
        );
        if (seq !== seqRef.current) return; // a newer request superseded this one
        pageRef.current = res.page;
        hasMoreRef.current = res.hasMore;
        setTotal(res.total);
        setHasMore(res.hasMore);
        setItems((prev) => {
          const clean = (res.data as (ProductCard | null | undefined)[]).filter(
            (p): p is ProductCard => !!p && !!(p as ProductCard).seller,
          );
          let next: ProductCard[];
          if (mode === 'reset') next = clean;
          else {
            const seen = new Set(prev.map((p) => p.id));
            next = prev.concat(clean.filter((p) => !seen.has(p.id)));
          }
          itemCountRef.current = next.length;
          setStatus(next.length === 0 ? 'empty' : 'ready');
          return next;
        });
      } catch {
        if (seq !== seqRef.current) return; // aborted / superseded — ignore
        setStatus(mode === 'append' ? 'loadMoreError' : 'error');
      } finally {
        if (seq === seqRef.current) {
          inFlightRef.current = false;
          setRefreshing(false);
        }
      }
    },
    [limit],
  );

  // Params (or enablement) changed → back to page 1.
  useEffect(() => {
    if (!enabled) return;
    hasMoreRef.current = false;
    pageRef.current = 0;
    void fetchPage(1, 'reset');
  }, [key, enabled, fetchPage]);

  // Abort anything in flight on unmount.
  useEffect(
    () => () => {
      seqRef.current++;
      abortRef.current?.abort();
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (!enabled || inFlightRef.current || !hasMoreRef.current) return;
    void fetchPage(pageRef.current + 1, 'append');
  }, [enabled, fetchPage]);

  const retry = useCallback(() => {
    if (!enabled) return;
    if (status === 'loadMoreError') {
      void fetchPage(pageRef.current + 1, 'append');
    } else {
      void fetchPage(1, 'reset');
    }
  }, [enabled, status, fetchPage]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    void fetchPage(1, 'reset');
  }, [enabled, fetchPage]);

  return { items, status, total, hasMore, refreshing, loadMore, retry, refresh };
}

export default useCommerceProductList;
