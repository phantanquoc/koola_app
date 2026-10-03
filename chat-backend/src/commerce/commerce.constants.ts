/**
 * Shared commerce catalog constants (design D5).
 *
 * `COMMERCE_CATEGORIES` is the single source of truth for product categories —
 * used by DTO validation (`@IsIn`), the schema enum and the seed script. The
 * mobile client mirrors these ids in its category chips.
 */
export const COMMERCE_CATEGORIES = [
  'grocery',
  'food',
  'electronics',
  'home',
  'beauty',
] as const;
export type CommerceCategory = (typeof COMMERCE_CATEGORIES)[number];

/** Public listing sort modes (spec: newest default | bestseller | priceLow). */
export const COMMERCE_SORT_KEYS = ['newest', 'bestseller', 'priceLow'] as const;
export type CommerceSortKey = (typeof COMMERCE_SORT_KEYS)[number];

// ─── Data-model limits (spec "Product data model") ──────────────────────────
export const PRODUCT_NAME_MAX = 200;
export const PRODUCT_DESCRIPTION_MAX = 2000;
export const PRODUCT_DELIVERY_TEXT_MAX = 100;
export const PRODUCT_MAX_IMAGES = 8;
export const PRODUCT_MAX_TAGS = 10;
export const PRODUCT_TAG_MAX = 40;

// ─── Public query limits ────────────────────────────────────────────────────
export const PRODUCT_QUERY_MAX = 100;
export const PRODUCT_LIST_DEFAULT_LIMIT = 20;
export const PRODUCT_LIST_MAX_LIMIT = 50;
export const VALIDATE_MAX_IDS = 100;
