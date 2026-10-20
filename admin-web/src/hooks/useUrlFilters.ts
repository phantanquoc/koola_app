import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL-as-state cho filter/search/pagination (AGENTS.md §6 + DESIGN.md §0.4).
 * Mọi filter nằm trong URL search params → reload giữ view, copy link share được.
 *
 * @example
 * const { values, set, reset } = useUrlFilters({ status: '', q: '', page: '1' });
 * set({ q: 'abc', page: '1' });
 */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const v = params.get(key);
      if (v !== null) out[key as keyof T] = v as T[keyof T];
    }
    return out;
  }, [params, defaults]);

  const set = useCallback(
    (patch: Partial<T>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === '' || v == null) next.delete(k);
            else next.set(k, String(v));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const reset = useCallback(() => {
    setParams({}, { replace: true });
  }, [setParams]);

  return useMemo(() => ({ values, set, reset }), [values, set, reset]);
}
