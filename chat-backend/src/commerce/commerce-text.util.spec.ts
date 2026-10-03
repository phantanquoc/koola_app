import {
  buildProductSearchText,
  escapeRegex,
  normalizeSearchText,
} from './commerce-text.util';

describe('commerce-text.util', () => {
  describe('normalizeSearchText', () => {
    it('lowercases and strips Vietnamese diacritics', () => {
      expect(normalizeSearchText('Combo Rau Củ Đà Lạt')).toBe(
        'combo rau cu da lat',
      );
      expect(normalizeSearchText('Cơm gà sốt tiêu xanh')).toBe(
        'com ga sot tieu xanh',
      );
      expect(normalizeSearchText('Nước mắm Phú Quốc')).toBe(
        'nuoc mam phu quoc',
      );
    });

    it('maps both Đ and đ to d', () => {
      expect(normalizeSearchText('Đặc sản')).toBe('dac san');
      expect(normalizeSearchText('đđĐĐ')).toBe('dddd');
    });

    it('handles precomposed and decomposed input identically', () => {
      const precomposed = 'Củ';
      const decomposed = 'Củ';
      expect(normalizeSearchText(precomposed)).toBe(
        normalizeSearchText(decomposed),
      );
    });

    it('collapses whitespace and trims', () => {
      expect(normalizeSearchText('  rau \t  cu \n ')).toBe('rau cu');
    });

    it('makes a diacritic-free query match diacritic product text', () => {
      const stored = buildProductSearchText('Combo Rau Củ Đà Lạt', ['Organic']);
      expect(stored.includes(normalizeSearchText('rau cu'))).toBe(true);
      expect(stored.includes(normalizeSearchText('RAU CỦ'))).toBe(true);
      expect(stored.includes(normalizeSearchText('organic'))).toBe(true);
    });
  });

  describe('buildProductSearchText', () => {
    it('concatenates name and tags', () => {
      expect(
        buildProductSearchText('Tai nghe', ['Chính hãng', 'Chứng nhận']),
      ).toBe('tai nghe chinh hang chung nhan');
    });

    it('works with no tags', () => {
      expect(buildProductSearchText('Gạo ST25', [])).toBe('gao st25');
    });
  });

  describe('escapeRegex', () => {
    it('escapes every regex metacharacter', () => {
      const raw = '.*+?^${}()|[]\\';
      const escaped = escapeRegex(raw);
      // The escaped string must match the raw text literally and nothing else.
      expect(new RegExp(escaped).test(raw)).toBe(true);
      expect(new RegExp(`^${escaped}$`).test('a')).toBe(false);
    });

    it('neutralizes a catastrophic/wildcard query', () => {
      const escaped = escapeRegex('.*');
      expect(new RegExp(escaped).test('anything')).toBe(false);
      expect(new RegExp(escaped).test('x.*y')).toBe(true);
    });
  });
});
