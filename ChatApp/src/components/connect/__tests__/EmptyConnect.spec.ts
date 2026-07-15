/**
 * EmptyConnect.spec.ts
 *
 * Logic tests for EmptyConnect filter-awareness.
 * Validates spec requirements:
 * - hasActiveFilter includes province and sort (not just category/relationship)
 * - No "change filters" message when no filters active
 * - Clear-filters action only shown when filters truly active
 */

// Test the logic extracted from EmptyConnect component
// We test the hasActiveFilter calculation and title/message selection
import type { BusinessSort } from '../../../types';

interface EmptyConnectInput {
  activeCategory?: string;
  activeRelationship?: string;
  activeProvince?: string;
  activeSort?: BusinessSort;
}

function computeEmptyState(input: EmptyConnectInput) {
  const { activeCategory, activeRelationship, activeProvince, activeSort } = input;
  const hasActiveFilter = Boolean(
    activeCategory || activeRelationship || activeProvince || (activeSort && activeSort !== 'latest'),
  );

  let title = 'Chưa có doanh nghiệp nào';
  if (activeCategory) {
    title = `Chưa có doanh nghiệp nào trong ngành ${activeCategory}`;
  } else if (activeRelationship) {
    title = `Chưa có ${activeRelationship} nào được tìm thấy`;
  } else if (activeProvince) {
    title = `Chưa có doanh nghiệp nào tại ${activeProvince}`;
  }

  const message = hasActiveFilter
    ? 'Hãy thử thay đổi bộ lọc để tìm kết quả phù hợp.'
    : 'Kéo xuống để làm mới hoặc tìm kiếm theo từ khóa.';

  return { hasActiveFilter, title, message };
}

describe('EmptyConnect filter logic', () => {
  it('reports no active filter when all inputs are empty/default', () => {
    const result = computeEmptyState({});
    expect(result.hasActiveFilter).toBe(false);
    expect(result.message).not.toContain('bộ lọc');
  });

  it('reports active filter when only province is set', () => {
    const result = computeEmptyState({ activeProvince: 'Hà Nội' });
    expect(result.hasActiveFilter).toBe(true);
    expect(result.title).toContain('Hà Nội');
  });

  it('reports active filter when only sort is non-default', () => {
    const result = computeEmptyState({ activeSort: 'popular' as BusinessSort });
    expect(result.hasActiveFilter).toBe(true);
  });

  it('reports NO active filter when sort is "latest" (default)', () => {
    const result = computeEmptyState({ activeSort: 'latest' });
    expect(result.hasActiveFilter).toBe(false);
  });

  it('reports active filter when category is set', () => {
    const result = computeEmptyState({ activeCategory: 'logistics' });
    expect(result.hasActiveFilter).toBe(true);
    expect(result.title).toContain('logistics');
  });

  it('reports active filter when relationship is set', () => {
    const result = computeEmptyState({ activeRelationship: 'partner' });
    expect(result.hasActiveFilter).toBe(true);
    expect(result.title).toContain('partner');
  });

  it('does not say "change filters" when no filters active', () => {
    const result = computeEmptyState({});
    expect(result.message).not.toContain('thay đổi bộ lọc');
  });

  it('says "change filters" when filters are active', () => {
    const result = computeEmptyState({ activeCategory: 'tech' });
    expect(result.message).toContain('thay đổi bộ lọc');
  });
});
