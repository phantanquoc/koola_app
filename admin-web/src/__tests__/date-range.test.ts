import { describe, it, expect } from 'vitest';
import { isoToDay, dayToIso, dayLabel } from '../components/date-range';

describe('date-range', () => {
  it('isoToDay lấy đúng ngày theo giờ máy, không theo UTC', () => {
    // 20:00 UTC ngày 30 = 03:00 ngày 31 ở UTC+7 → phải ra 2026-10-31.
    expect(isoToDay('2026-10-30T20:00:00.000Z')).toBe('2026-10-31');
  });

  it('isoToDay rỗng/không hợp lệ trả chuỗi rỗng', () => {
    expect(isoToDay('')).toBe('');
    expect(isoToDay(undefined)).toBe('');
    expect(isoToDay('rác')).toBe('');
  });

  it('dayToIso from = đầu ngày, to = cuối ngày', () => {
    const from = new Date(dayToIso('2026-10-01', 'from'));
    const to = new Date(dayToIso('2026-10-01', 'to'));
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(to.getSeconds()).toBe(59);
    // Cùng một ngày địa phương
    expect(isoToDay(dayToIso('2026-10-01', 'to'))).toBe('2026-10-01');
  });

  it('round-trip: dayToIso → isoToDay giữ nguyên ngày', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      expect(isoToDay(dayToIso(day, 'from'))).toBe(day);
      expect(isoToDay(dayToIso(day, 'to'))).toBe(day);
    }
  });

  it('dayToIso rỗng trả rỗng', () => {
    expect(dayToIso('', 'from')).toBe('');
    expect(dayToIso('', 'to')).toBe('');
  });

  it('dayLabel định dạng dd/mm/yyyy', () => {
    expect(dayLabel('2026-10-01')).toBe('1/10/2026');
  });
});
