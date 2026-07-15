/**
 * formatShortTimestamp.spec.ts
 *
 * Tests for the locale-aware Vietnamese compact timestamp formatter.
 * Validates spec requirements:
 * - No ambiguous abbreviations (5g, 1n, 2tu, 2th)
 * - Understandable VN forms (giờ, ngày, tuần, tháng)
 * - Year included for dates older than ~11 months
 */

import { formatShortTimestamp } from '../../utils/formatViTimestamp';

function dateMinusMs(ms: number): Date {
  return new Date(Date.now() - ms);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe('formatShortTimestamp', () => {
  it('returns "vừa xong" for less than 1 minute', () => {
    expect(formatShortTimestamp(dateMinusMs(30_000))).toBe('vừa xong');
  });

  it('returns minutes with "phút" suffix', () => {
    const result = formatShortTimestamp(dateMinusMs(5 * MINUTE));
    expect(result).toBe('5 phút');
  });

  it('returns hours with "giờ" suffix (not "g")', () => {
    const result = formatShortTimestamp(dateMinusMs(5 * HOUR));
    expect(result).toBe('5 giờ');
    expect(result).not.toMatch(/^\d+g$/);
  });

  it('returns days with "ngày" suffix (not ambiguous "n")', () => {
    const result = formatShortTimestamp(dateMinusMs(3 * DAY));
    expect(result).toBe('3 ngày');
    expect(result).not.toMatch(/^\d+n$/);
  });

  it('returns weeks with "tuần" suffix (not "tu")', () => {
    const result = formatShortTimestamp(dateMinusMs(2 * WEEK));
    expect(result).toBe('2 tuần');
    expect(result).not.toMatch(/^\d+tu$/);
  });

  it('returns months with "tháng" suffix (not "th")', () => {
    const result = formatShortTimestamp(dateMinusMs(90 * DAY));
    expect(result).toBe('3 tháng');
    expect(result).not.toMatch(/^\d+th$/);
  });

  it('returns explicit date with year for >11 months', () => {
    const result = formatShortTimestamp(dateMinusMs(400 * DAY));
    // Should contain a year (4-digit number)
    expect(result).toMatch(/\d{4}/);
    // Should not be an ambiguous abbreviation
    expect(result).not.toMatch(/^\d+n$/);
  });

  it('day/year ambiguity is resolved — 1 day uses "ngày"', () => {
    const result = formatShortTimestamp(dateMinusMs(1 * DAY));
    expect(result).toBe('1 ngày');
  });
});
