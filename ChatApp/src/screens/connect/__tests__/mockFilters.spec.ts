/**
 * mockFilters.spec.ts
 *
 * Pure-logic tests for filterMocks + mergeDiscoveryItems in mockFilters.ts.
 * No renderer needed — tests the predicate in isolation.
 */
import { filterMocks, mergeDiscoveryItems } from '../mockFilters';
import type { FilterableBusiness } from '../mockFilters';

function mk(id: string, overrides: Partial<FilterableBusiness> = {}): FilterableBusiness {
  return {
    _id: id,
    displayName: id,
    businessCategory: undefined,
    province: undefined,
    relationshipType: undefined,
    viewCount: 0,
    ...overrides,
  };
}

describe('filterMocks', () => {
  const base: FilterableBusiness[] = [
    mk('a', { businessCategory: 'logistics', province: 'Hà Nội', relationshipType: 'partner', viewCount: 10, displayName: 'Beta' }),
    mk('b', { businessCategory: 'packaging', province: 'TP. Hồ Chí Minh', relationshipType: 'supplier', viewCount: 30, displayName: 'Alpha' }),
    mk('c', { businessCategory: 'logistics', province: 'Hà Nội', relationshipType: undefined, viewCount: 20, displayName: 'Gamma' }),
    mk('d', { businessCategory: 'food-beverage', province: 'Đà Nẵng', relationshipType: 'partner', viewCount: 5, displayName: 'Delta' }),
  ];

  it('returns all mocks when no filters active', () => {
    const out = filterMocks(base, {});
    expect(out).toHaveLength(4);
    // Identity preserved when no filter
    expect(out).toBe(base);
  });

  it('returns all mocks when relationship=all with no other filter', () => {
    const out = filterMocks(base, { relationship: 'all' });
    expect(out).toHaveLength(4);
    expect(out).toBe(base);
  });

  it('relationship=partner returns only partner mocks', () => {
    const out = filterMocks(base, { relationship: 'partner' });
    expect(out.map((m) => m._id).sort()).toEqual(['a', 'd']);
  });

  it('relationship=supplier returns only supplier mocks', () => {
    const out = filterMocks(base, { relationship: 'supplier' });
    expect(out.map((m) => m._id)).toEqual(['b']);
  });

  it('excludes items lacking relationshipType when relationship filter active', () => {
    const out = filterMocks(base, { relationship: 'partner' });
    // c has no relationshipType → must be excluded
    expect(out.find((m) => m._id === 'c')).toBeUndefined();
    const out2 = filterMocks(base, { relationship: 'supplier' });
    expect(out2.find((m) => m._id === 'c')).toBeUndefined();
  });

  it('includes items lacking relationshipType when relationship=all', () => {
    const out = filterMocks(base, { relationship: 'all' });
    // c must be present when no narrowing filter
    expect(out.find((m) => m._id === 'c')).toBeDefined();
  });

  it('province filter composes with relationship filter', () => {
    const out = filterMocks(base, { province: 'Hà Nội', relationship: 'partner' });
    expect(out.map((m) => m._id)).toEqual(['a']);
  });

  it('category filter composes with relationship filter', () => {
    const out = filterMocks(base, { category: 'logistics', relationship: 'partner' });
    expect(out.map((m) => m._id)).toEqual(['a']);
  });

  it('province + category + relationship together', () => {
    const out = filterMocks(base, { category: 'logistics', province: 'Hà Nội', relationship: 'supplier' });
    expect(out).toHaveLength(0);
  });

  it('sort=popular sorts by viewCount descending', () => {
    const out = filterMocks(base, { sort: 'popular' });
    expect(out.map((m) => m._id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('sort=name sorts by displayName Vietnamese locale', () => {
    const out = filterMocks(base, { sort: 'name' });
    expect(out.map((m) => m.displayName)).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
  });

  it('sort=latest preserves order', () => {
    const out = filterMocks(base, { sort: 'latest' });
    expect(out.map((m) => m._id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sort combined with relationship filter', () => {
    const out = filterMocks(base, { relationship: 'partner', sort: 'popular' });
    // partners are a(10), d(5) → popular order a, d
    expect(out.map((m) => m._id)).toEqual(['a', 'd']);
  });

  it('does not mutate input array when sorting', () => {
    const copy = [...base];
    filterMocks(base, { sort: 'popular' });
    expect(base.map((m) => m._id)).toEqual(copy.map((m) => m._id));
  });
});

describe('mergeDiscoveryItems', () => {
  it('returns mocks when reals empty', () => {
    const mocks = [mk('m1'), mk('m2')];
    const out = mergeDiscoveryItems(mocks, []);
    expect(out).toBe(mocks);
  });

  it('appends reals after mocks', () => {
    const mocks = [mk('m1')];
    const reals = [mk('r1'), mk('r2')];
    const out = mergeDiscoveryItems(mocks, reals);
    expect(out.map((m) => m._id)).toEqual(['m1', 'r1', 'r2']);
  });

  it('drops reals whose _id already exists among mocks', () => {
    const mocks = [mk('m1'), mk('m2')];
    const reals = [mk('m1'), mk('r1')];
    const out = mergeDiscoveryItems(mocks, reals);
    expect(out.map((m) => m._id)).toEqual(['m1', 'm2', 'r1']);
  });

  it('handles both empty', () => {
    const out = mergeDiscoveryItems([], []);
    expect(out).toHaveLength(0);
  });
});
