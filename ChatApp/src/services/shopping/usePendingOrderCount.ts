import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { commerceApi } from '../api/apiService';

/**
 * Badge-only counter for PENDING orders (buyer or seller side).
 *
 * Reads `total` from a 1-row page (`page: 1, limit: 1`) — the order screens
 * already paginate the real lists, this hook only needs the count that drives
 * a badge. Nothing is fetched while `enabled` is false, and the hook refetches
 * on focus (not just mount) so the badge is right after the user comes back
 * from the orders screen.
 *
 * Failures are intentionally silent: a badge is decoration, so an error keeps
 * the previous value (no reset to 0, no throw, no toast).
 */
export function usePendingOrderCount(
  scope: 'buyer' | 'seller',
  enabled: boolean,
): number {
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      // Guards the setState after unmount / after `scope` changes mid-flight.
      const cancelled = { value: false };
      const params = { status: 'PENDING' as const, page: 1, limit: 1 };
      const request =
        scope === 'buyer'
          ? commerceApi.listMyOrders(params)
          : commerceApi.listSellerOrders(params);
      request.then(
        (res) => {
          if (!cancelled.value) setCount(res.total);
        },
        () => {
          // Silent by design — keep the last known count.
        },
      );
      return () => {
        cancelled.value = true;
      };
    }, [scope, enabled]),
  );

  return enabled ? count : 0;
}

export default usePendingOrderCount;
