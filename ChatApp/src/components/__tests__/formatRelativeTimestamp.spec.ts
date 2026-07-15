/**
 * formatRelativeTimestamp.spec.ts
 *
 * Tests for the longer-form Vietnamese relative timestamp (calls/search).
 * Validates spec requirement: year included for calls from a different calendar year.
 */

import { formatRelativeTimestamp } from '../../utils/formatViTimestamp';

describe('formatRelativeTimestamp', () => {
  it('returns "Vừa xong" for less than 1 minute', () => {
    const now = new Date().toISOString();
    expect(formatRelativeTimestamp(now)).toBe('Vừa xong');
  });

  it('returns minutes with "phút trước" suffix', () => {
    const date = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(formatRelativeTimestamp(date)).toBe('10 phút trước');
  });

  it('returns hours with "giờ trước" suffix', () => {
    const date = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(formatRelativeTimestamp(date)).toBe('3 giờ trước');
  });

  it('returns days with "ngày trước" suffix', () => {
    const date = new Date(Date.now() - 5 * 86400_000).toISOString();
    expect(formatRelativeTimestamp(date)).toBe('5 ngày trước');
  });

  it('returns date without year for same calendar year (>7 days)', () => {
    // 20 days ago, same year
    const date = new Date(Date.now() - 20 * 86400_000);
    const result = formatRelativeTimestamp(date.toISOString());
    // Should be dd/MM or dd-MM format (locale-dependent separator)
    expect(result).toMatch(/\d{2}[/.,-]\d{2}/);
    // Should NOT contain 4-digit year if same year
    if (date.getFullYear() === new Date().getFullYear()) {
      expect(result).not.toMatch(/\d{4}/);
    }
  });

  it('includes year for dates from a different calendar year', () => {
    const pastYear = new Date();
    pastYear.setFullYear(pastYear.getFullYear() - 1);
    const result = formatRelativeTimestamp(pastYear.toISOString());
    expect(result).toMatch(/\d{4}/);
  });
});
