import { applyCreatedAtRange } from './date-range';

describe('applyCreatedAtRange', () => {
  it('không thêm gì khi both rỗng', () => {
    const filter: Record<string, unknown> = { status: 'pending' };
    applyCreatedAtRange(filter, undefined, '');
    expect(filter).toEqual({ status: 'pending' });
  });

  it('from → $gte, to → $lte, tính cả biên', () => {
    const filter: Record<string, unknown> = {};
    applyCreatedAtRange(
      filter,
      '2026-10-01T00:00:00.000Z',
      '2026-10-31T23:59:59.999Z',
    );
    const range = filter.createdAt as { $gte: Date; $lte: Date };
    expect(range.$gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(range.$lte.toISOString()).toBe('2026-10-31T23:59:59.999Z');
  });

  it('chỉ from → chỉ $gte', () => {
    const filter: Record<string, unknown> = {};
    applyCreatedAtRange(filter, '2026-10-01', null);
    expect(Object.keys(filter.createdAt as object)).toEqual(['$gte']);
  });

  // Tab SLA đặt createdAt trước → không được xoá điều kiện đó.
  it('merge với điều kiện createdAt có sẵn thay vì ghi đè', () => {
    const filter: Record<string, unknown> = {
      createdAt: { $gte: new Date('2026-09-01T00:00:00.000Z') },
    };
    applyCreatedAtRange(filter, undefined, '2026-10-31T23:59:59.999Z');
    const range = filter.createdAt as { $gte: Date; $lte: Date };
    expect(range.$gte.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(range.$lte.toISOString()).toBe('2026-10-31T23:59:59.999Z');
  });

  it('ngày không parse được thì bỏ qua, không ném', () => {
    const filter: Record<string, unknown> = {};
    applyCreatedAtRange(filter, 'not-a-date', '');
    expect(filter.createdAt).toBeUndefined();
  });
});
