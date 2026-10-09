import type { BusinessSort } from '../../types';

/**
 * Minimal shape the mock-filtering predicate needs. Kept structural rather than
 * importing `MockBusiness` so the predicate stays pure and trivially testable.
 */
export type FilterableBusiness = {
  _id: string;
  displayName: string;
  businessCategory?: string;
  province?: string;
  relationshipType?: 'partner' | 'supplier';
  viewCount?: number;
};

export type MockFilters = {
  /** Business category slug, or undefined for "all". */
  category?: string;
  /** Province name, or '' for "all". */
  province?: string;
  /** Relationship slug, or 'all'. */
  relationship?: string;
  sort?: BusinessSort;
};

/**
 * Pure predicate for the Connect discovery list's mock rows.
 *
 * Extracted from `ConnectHomeScreen`'s `displayItems` memo so the filtering
 * rules can be tested without a renderer.
 *
 * Relationship semantics: when a relationship filter other than `all` is
 * active, an item with **no** `relationshipType` is EXCLUDED. The previous
 * inline logic tested `m.relationshipType && m.relationshipType !== filter`,
 * which let unclassifiable rows survive every relationship filter — a filter
 * that cannot narrow the list is not a filter. The `all` case passes no filter
 * at all and therefore still returns everything.
 */
export function filterMocks<T extends FilterableBusiness>(
  mocks: readonly T[],
  filters: MockFilters,
): T[] {
  const { category, province, relationship, sort } = filters;
  const hasActiveFilter =
    Boolean(category) || Boolean(province) || (relationship !== undefined && relationship !== 'all') || (sort !== undefined && sort !== 'latest');

  // No active filter → return the list untouched (identity preserved).
  if (!hasActiveFilter) return mocks as T[];

  const filtered = mocks.filter((m) => {
    if (category && m.businessCategory !== category) return false;
    if (province && m.province !== province) return false;
    if (relationship && relationship !== 'all' && m.relationshipType !== relationship) return false;
    return true;
  });

  if (sort === 'popular') {
    return [...filtered].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  }
  if (sort === 'name') {
    return [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
  }
  return filtered;
}

/**
 * Merge the filtered mocks with the API-supplied items, dropping reals whose
 * `_id` already exists among the mocks so a seeded mock is never rendered twice.
 * Real items are appended after the mocks, preserving their relative order.
 */
export function mergeDiscoveryItems<T extends { _id: string }>(
  mocks: readonly T[],
  reals: readonly T[],
): T[] {
  if (reals.length === 0) return mocks as T[];
  const mockIds = new Set(mocks.map((m) => m._id));
  const dedupedReals = reals.filter((it) => !mockIds.has(it._id));
  return [...mocks, ...dedupedReals];
}