import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { OpsLogService, maskPhone } from './ops-log.service';
import { OtpLog } from './schemas/otp-log.schema';
import { PushLog } from './schemas/push-log.schema';

const otpModel = {
  create: jest.fn(),
  aggregate: jest.fn(),
};
const pushModel = {
  create: jest.fn(),
  aggregate: jest.fn(),
};

describe('maskPhone', () => {
  it('giữ 3 số đầu + 2 số cuối', () => {
    expect(maskPhone('0912345678')).toBe('091•••78');
  });

  it('chuẩn hoá +84 về dạng nội địa trước khi che', () => {
    expect(maskPhone('+84912345678')).toBe('091•••78');
  });

  it('số quá ngắn che toàn bộ để không lộ gì', () => {
    expect(maskPhone('0912')).toBe('•••');
    expect(maskPhone('')).toBe('•••');
    expect(maskPhone(null)).toBe('•••');
  });
});

describe('OpsLogService', () => {
  let service: OpsLogService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        OpsLogService,
        { provide: getModelToken(OtpLog.name), useValue: otpModel },
        { provide: getModelToken(PushLog.name), useValue: pushModel },
      ],
    }).compile();
    service = module.get(OpsLogService);
  });

  describe('ghi log fire-and-forget', () => {
    it('nuốt lỗi DB của otp log, không ném ra luồng gửi OTP', async () => {
      otpModel.create.mockRejectedValue(new Error('mongo down'));

      expect(() =>
        service.logOtp({
          phone: '0912345678',
          channel: 'sms',
          purpose: 'register',
          success: true,
          provider: 'plivo',
        }),
      ).not.toThrow();

      await new Promise((r) => setImmediate(r));
      expect(otpModel.create).toHaveBeenCalledTimes(1);
    });

    it('nuốt lỗi DB của push log', async () => {
      pushModel.create.mockRejectedValue(new Error('mongo down'));

      expect(() =>
        service.logPush({
          userId: 'u1',
          tokenCount: 0,
          successCount: 0,
          failureCount: 0,
          title: 't',
          body: 'b',
          kind: 'message',
        }),
      ).not.toThrow();

      await new Promise((r) => setImmediate(r));
      expect(pushModel.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('listOtp', () => {
    it('che SĐT trong response và tính tỉ lệ thành công từ aggregate', async () => {
      otpModel.aggregate.mockResolvedValue([
        {
          data: [
            { _id: '1', phone: '0912345678', channel: 'sms', success: true },
            { _id: '2', phone: '+84912345678', channel: 'sms', success: false },
            { _id: '3', phone: 'a@b.com', channel: 'email', success: true },
          ],
          stats: [{ total: 4, success: 3 }],
        },
      ]);

      const res = await service.listOtp({ page: 2, limit: 2 });

      expect(res.data.map((d) => d.phone)).toEqual([
        '091•••78',
        '091•••78',
        'a@b.com',
      ]);
      // total khớp số dòng trong khoảng lọc — một con số, không lệch với stats.
      expect(res.total).toBe(4);
      expect(res.stats).toEqual({
        total: 4,
        success: 3,
        failed: 1,
        successRate: 0.75,
      });
      // Trang 2 limit 2 → skip 2, một query duy nhất.
      const [pipeline] = otpModel.aggregate.mock.calls[0] as [
        Array<Record<string, unknown>>,
      ];
      const facet = pipeline[1].$facet as Record<string, unknown[]>;
      expect(facet.data[1]).toEqual({ $skip: 2 });
      expect(otpModel.aggregate).toHaveBeenCalledTimes(1);
    });

    it('khoảng lọc rỗng → tỉ lệ 0 thay vì chia 0', async () => {
      otpModel.aggregate.mockResolvedValue([{ data: [], meta: [], stats: [] }]);

      const res = await service.listOtp({});

      expect(res.stats).toEqual({
        total: 0,
        success: 0,
        failed: 0,
        successRate: 0,
      });
    });

    it('lọc success=false và phone khớp cả dạng +84 lẫn 0…', async () => {
      otpModel.aggregate.mockResolvedValue([{ data: [], meta: [], stats: [] }]);

      await service.listOtp({ success: 'false', phone: '0912 345 678' });

      const [pipeline] = otpModel.aggregate.mock.calls[0] as [
        Array<Record<string, unknown>>,
      ];
      const match = pipeline[0].$match as Record<string, unknown>;
      expect(match.success).toBe(false);
      expect((match.phone as { $in: unknown[] }).$in).toHaveLength(2);
    });
  });

  describe('listPush', () => {
    it('tính tỉ lệ delivered trên tổng token đã thử', async () => {
      pushModel.aggregate.mockResolvedValue([
        {
          data: [{ _id: 'p1', userId: 'u1', tokenCount: 2 }],
          stats: [
            { total: 2, tokenCount: 4, successCount: 3, failureCount: 1 },
          ],
        },
      ]);

      const res = await service.listPush({ page: 1, limit: 20 });

      expect(res.total).toBe(2);
      expect(res.stats.deliveryRate).toBe(0.75);
      expect(res.stats.failureCount).toBe(1);
    });

    it('0 token → deliveryRate 0, không chia 0', async () => {
      pushModel.aggregate.mockResolvedValue([
        { data: [], meta: [], stats: [] },
      ]);

      const res = await service.listPush({});

      expect(res.stats.deliveryRate).toBe(0);
      expect(res.stats.tokenCount).toBe(0);
    });
  });
});
