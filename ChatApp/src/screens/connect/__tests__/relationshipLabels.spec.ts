/**
 * relationshipLabels.spec.ts
 *
 * Pure-logic tests for the shared relationship labels and filter slugs
 * defined in constants.ts. No renderer needed.
 */
import { RELATIONSHIP_FILTERS, RELATIONSHIP_LABELS, relationshipLabel } from '../constants';

describe('RELATIONSHIP_FILTERS', () => {
  it('exposes slugs all / partner / supplier', () => {
    const slugs = RELATIONSHIP_FILTERS.map((f) => f.slug);
    expect(slugs).toEqual(['all', 'partner', 'supplier']);
  });

  it('exposes labels Tất cả / Yêu cầu mua / Yêu cầu bán', () => {
    const labels = RELATIONSHIP_FILTERS.map((f) => f.label);
    expect(labels).toEqual(['Tất cả', 'Yêu cầu mua', 'Yêu cầu bán']);
  });

  it('has exactly 3 entries', () => {
    expect(RELATIONSHIP_FILTERS).toHaveLength(3);
  });
});

describe('RELATIONSHIP_LABELS', () => {
  it('maps partner to Yêu cầu mua', () => {
    expect(RELATIONSHIP_LABELS.partner).toBe('Yêu cầu mua');
  });

  it('maps supplier to Yêu cầu bán', () => {
    expect(RELATIONSHIP_LABELS.supplier).toBe('Yêu cầu bán');
  });

  it('has exactly partner and supplier keys', () => {
    expect(Object.keys(RELATIONSHIP_LABELS).sort()).toEqual(['partner', 'supplier']);
  });
});

describe('relationshipLabel()', () => {
  it('returns Yêu cầu mua for partner', () => {
    expect(relationshipLabel('partner')).toBe('Yêu cầu mua');
  });

  it('returns Yêu cầu bán for supplier', () => {
    expect(relationshipLabel('supplier')).toBe('Yêu cầu bán');
  });

  it('returns undefined for null', () => {
    expect(relationshipLabel(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(relationshipLabel(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(relationshipLabel('')).toBeUndefined();
  });

  it('returns undefined for unknown slug', () => {
    expect(relationshipLabel('unknown')).toBeUndefined();
  });
});
