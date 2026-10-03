import { useMemo, useSyncExternalStore } from 'react';
import {
  cartStore,
  groupCartLines,
  totalQuantityOf,
  type CartGroup,
  type CartLine,
} from './cartStore';

export interface UseCartResult {
  lines: CartLine[];
  /** Lines grouped by seller, each with its subtotal (available lines only). */
  groups: CartGroup[];
  /** Sum of all line quantities — drives the header badge. */
  totalQuantity: number;
}

/** Subscribe to the shared, device-persisted cart (commerce-catalog D11). */
export function useCart(): UseCartResult {
  const lines = useSyncExternalStore(cartStore.subscribe, cartStore.getLines);
  return useMemo(
    () => ({
      lines,
      groups: groupCartLines(lines),
      totalQuantity: totalQuantityOf(lines),
    }),
    [lines],
  );
}

/** Badge text: hidden at 0 (null), "99+" above 99. */
export function cartBadgeLabel(totalQuantity: number): string | null {
  if (totalQuantity <= 0) return null;
  return totalQuantity > 99 ? '99+' : String(totalQuantity);
}

export default useCart;
