import type {
  CommerceCategory,
  CommerceSort,
  ProductCard,
  ProductDetail,
} from '../../services/api/apiService';
import { cartStore, type CartSnapshot } from '../../services/shopping/cartStore';

/**
 * Shopping UI catalog constants + helpers shared by the live screens.
 * (Category ids mirror chat-backend/src/commerce/commerce.constants.ts.)
 */

export const SHOPPING_CATEGORIES: ReadonlyArray<{ id: CommerceCategory; label: string }> = [
  { id: 'grocery', label: 'Tạp hóa' },
  { id: 'food', label: 'Đồ ăn' },
  { id: 'electronics', label: 'Điện tử' },
  { id: 'home', label: 'Nhà cửa' },
  { id: 'beauty', label: 'Làm đẹp' },
];

/**
 * User-visible label for every server `sort` value — the single source both
 * chip groups below derive from, so the home filter row and the storefront
 * row can never drift apart (or lose their diacritics independently).
 */
export const SORT_LABELS: Record<CommerceSort, string> = {
  newest: 'Mới nhất',
  bestseller: 'Bán chạy',
  priceLow: 'Giá thấp nhất',
};

/** Sort chips → server `sort` param ("no chip" = server default `newest`). */
export const SHOPPING_SORT_CHIPS: ReadonlyArray<{ sort: Exclude<CommerceSort, 'newest'>; label: string }> = [
  { sort: 'bestseller', label: SORT_LABELS.bestseller },
  { sort: 'priceLow', label: SORT_LABELS.priceLow },
];

/**
 * Storefront chips — all three sorts, `newest` included: the storefront has a
 * persistent selected sort (not a toggle), so the default needs to be tappable.
 */
export const STOREFRONT_SORT_CHIPS: ReadonlyArray<{ sort: CommerceSort; label: string }> = [
  { sort: 'newest', label: SORT_LABELS.newest },
  { sort: 'bestseller', label: SORT_LABELS.bestseller },
  { sort: 'priceLow', label: SORT_LABELS.priceLow },
];

/** Tag chips → server `tag` param (exact tag match). */
export const SHOPPING_TAG_CHIPS = ['Organic', 'Chứng nhận', 'Đã xác minh'] as const;

/** Category → glyph for the image placeholder / fallback. */
export const CATEGORY_ICON: Record<CommerceCategory, string> = {
  grocery: 'local-grocery-store',
  food: 'restaurant',
  electronics: 'phone-iphone',
  home: 'home',
  beauty: 'spa',
};

/** "Đã bán N" when N > 0, otherwise null (spec: hidden when 0). */
export function soldLabel(soldCount: number): string | null {
  if (!soldCount || soldCount <= 0) return null;
  if (soldCount >= 1000) {
    const k = Math.floor(soldCount / 100) / 10;
    return `Đã bán ${String(k).replace('.', ',')}k`;
  }
  return `Đã bán ${soldCount}`;
}

export function cartSnapshotOf(p: ProductCard | ProductDetail): CartSnapshot {
  return {
    name: p.name,
    price: p.price,
    imageKey: p.imageKey ?? ('imageKeys' in p ? (p.imageKeys[0] ?? null) : null),
    seller: { id: p.seller.id, displayName: p.seller.displayName },
  };
}

/** Add one unit of a product to the shared cart. Returns false if signed out. */
export function addProductToCart(p: ProductCard | ProductDetail, qty = 1): boolean {
  return cartStore.add(p.id, cartSnapshotOf(p), qty);
}
