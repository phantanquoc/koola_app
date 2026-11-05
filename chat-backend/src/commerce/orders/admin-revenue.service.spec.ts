import { AdminRevenueService } from './admin-revenue.service';

/**
 * GMV/hoa hồng là số liệu kế toán: sai một công thức là lệch sổ, nên spec bám
 * đúng các quyết định nghiệp vụ thay vì hình dạng object.
 *
 * - GMV bỏ đơn CANCELLED, phần huỷ vào `cancelledGmv`.
 * - Hoàn tiền KHÔNG trừ GMV (tiền đã thu vẫn là doanh thu, hoàn là chi phí).
 * - Hoa hồng tính theo tỉ lệ TỪNG seller; tổng = tổng hoa hồng từng seller.
 */
describe('AdminRevenueService', () => {
  const aggregate = jest.fn();
  const orderModel = { aggregate };

  const findUser = jest.fn();
  const userModel = {
    find: jest.fn(() => ({ select: () => ({ lean: findUser }) })),
  };

  const service = new AdminRevenueService(
    orderModel as never,
    userModel as never,
  );

  beforeEach(() => jest.clearAllMocks());

  function fakeRows(overrides: Partial<{
    totals: unknown[];
    daily: unknown[];
    sellers: unknown[];
    daySeller: unknown[];
  }> = {}) {
    aggregate.mockResolvedValue([
      {
        totals: overrides.totals ?? [
          { _id: null, gmv: 1_000_000, orderCount: 10, cancelledGmv: 200_000, refundAmount: 50_000 },
        ],
        daily: overrides.daily ?? [
          { _id: '2026-10-26', gmv: 400_000, orderCount: 4, cancelledGmv: 0, refundAmount: 0 },
          { _id: '2026-10-27', gmv: 600_000, orderCount: 6, cancelledGmv: 200_000, refundAmount: 50_000 },
        ],
        sellers: overrides.sellers ?? [
          { _id: '507f1f77bcf86cd799439011', gmv: 700_000, orderCount: 7, cancelledGmv: 0, refundAmount: 0 },
          { _id: '507f1f77bcf86cd799439012', gmv: 300_000, orderCount: 3, cancelledGmv: 200_000, refundAmount: 50_000 },
        ],
        daySeller: overrides.daySeller ?? [
          { day: '2026-10-26', sellerId: '507f1f77bcf86cd799439011', gmv: 400_000 },
          { day: '2026-10-27', sellerId: '507f1f77bcf86cd799439011', gmv: 300_000 },
          { day: '2026-10-27', sellerId: '507f1f77bcf86cd799439012', gmv: 300_000 },
        ],
      },
    ]);
  }

  function usersWithRates(rows: { _id: string; displayName: string; commissionRate: number }[]) {
    findUser.mockImplementation(() =>
      Promise.resolve(
        rows.map((r) => ({
          _id: { toString: () => r._id },
          displayName: r.displayName,
          commissionRate: r.commissionRate,
        })),
      ),
    );
  }

  it('hoa hồng = GMV × tỉ lệ của từng seller', async () => {
    fakeRows();
    usersWithRates([
      { _id: '507f1f77bcf86cd799439011', displayName: 'Shop A', commissionRate: 0.1 },
      { _id: '507f1f77bcf86cd799439012', displayName: 'Shop B', commissionRate: 0.05 },
    ]);

    const res = await service.summary({ from: '2026-10-26', to: '2026-10-27' });

    const a = res.sellers.find((s) => s.sellerId === '507f1f77bcf86cd799439011');
    const b = res.sellers.find((s) => s.sellerId === '507f1f77bcf86cd799439012');
    expect(a?.commission).toBe(70_000); // 700k × 10%
    expect(b?.commission).toBe(15_000); // 300k × 5%
    expect(a?.sellerName).toBe('Shop A');
  });

  it('tổng hoa hồng = tổng hoa hồng từng seller, không phải GMV × một tỉ lệ', async () => {
    fakeRows();
    usersWithRates([
      { _id: '507f1f77bcf86cd799439011', displayName: 'A', commissionRate: 0.1 },
      { _id: '507f1f77bcf86cd799439012', displayName: 'B', commissionRate: 0.05 },
    ]);

    const res = await service.summary({ from: '2026-10-26', to: '2026-10-27' });

    expect(res.totals.commission).toBe(85_000);
    expect(res.totals.gmv).toBe(1_000_000);
    expect(res.totals.cancelledGmv).toBe(200_000);
  });

  it('hoàn tiền cộng riêng, không trừ vào GMV', async () => {
    fakeRows();
    usersWithRates([]);

    const res = await service.summary({ from: '2026-10-26', to: '2026-10-27' });

    expect(res.totals.gmv).toBe(1_000_000);
    expect(res.totals.refundAmount).toBe(50_000);
  });

  it('hoa hồng theo ngày cộng dồn từng cặp ngày×seller', async () => {
    fakeRows();
    usersWithRates([
      { _id: '507f1f77bcf86cd799439011', displayName: 'A', commissionRate: 0.1 },
      { _id: '507f1f77bcf86cd799439012', displayName: 'B', commissionRate: 0.05 },
    ]);

    const res = await service.summary({ from: '2026-10-26', to: '2026-10-27' });
    const day26 = res.daily.find((d) => d.date === '2026-10-26');
    const day27 = res.daily.find((d) => d.date === '2026-10-27');

    expect(day26?.commission).toBe(40_000); // 400k × 10%
    expect(day27?.commission).toBe(45_000); // 300k × 10% + 300k × 5%
  });

  it('seller chưa cấu hình tỉ lệ → hoa hồng 0 (không bịa số)', async () => {
    fakeRows();
    usersWithRates([
      { _id: '507f1f77bcf86cd799439011', displayName: 'A', commissionRate: 0 },
      { _id: '507f1f77bcf86cd799439012', displayName: 'B', commissionRate: 0 },
    ]);

    const res = await service.summary({});

    expect(res.totals.commission).toBe(0);
    expect(res.sellers.every((s) => s.commission === 0)).toBe(true);
  });

  it('không có đơn nào → trả bucket rỗng thay vì undefined', async () => {
    aggregate.mockResolvedValue([{ totals: [], daily: [], sellers: [], daySeller: [] }]);
    usersWithRates([]);

    const res = await service.summary({ from: '2026-10-26', to: '2026-10-27' });

    expect(res.totals).toEqual({
      gmv: 0,
      orderCount: 0,
      cancelledGmv: 0,
      refundAmount: 0,
      commission: 0,
    });
    expect(res.daily).toEqual([]);
  });

  it('lọc theo sellerId đi vào $match và ngày hiểu theo giờ Việt Nam', async () => {
    fakeRows();
    usersWithRates([]);

    await service.summary({
      from: '2026-10-01',
      to: '2026-10-31',
      sellerId: '507f1f77bcf86cd799439011',
    });

    const pipeline = aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const match = pipeline[0].$match as {
      sellerId: string;
      createdAt: { $gte: Date; $lte: Date };
    };
    expect(match.sellerId).toBe('507f1f77bcf86cd799439011');
    // 2026-10-01 00:00 giờ VN = 2026-09-30T17:00Z
    expect(match.createdAt.$gte.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(match.createdAt.$lte.toISOString()).toBe('2026-10-31T16:59:59.999Z');
  });
});
