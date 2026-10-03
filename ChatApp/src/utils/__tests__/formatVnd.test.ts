import { formatVnd } from '../formatVnd';

describe('formatVnd', () => {
  it('groups thousands with dots and appends đ', () => {
    expect(formatVnd(89000)).toBe('89.000đ');
    expect(formatVnd(1250000)).toBe('1.250.000đ');
    expect(formatVnd(999)).toBe('999đ');
    expect(formatVnd(1000)).toBe('1.000đ');
    expect(formatVnd(0)).toBe('0đ');
  });

  it('rounds non-integers (prices are integer VND)', () => {
    expect(formatVnd(89000.4)).toBe('89.000đ');
    expect(formatVnd(999.6)).toBe('1.000đ');
  });

  it('handles negatives and non-finite input', () => {
    expect(formatVnd(-15000)).toBe('-15.000đ');
    expect(formatVnd(Number.NaN)).toBe('—');
    expect(formatVnd(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
