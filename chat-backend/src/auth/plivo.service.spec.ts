import { HttpException, HttpStatus } from '@nestjs/common';
import { PlivoService } from './plivo.service';
import { OpsLogService } from '../ops/ops-log.service';
import { RedisService } from '../common/redis/redis.service';

/**
 * Không set PLIVO_AUTH_* → client null, sendOtp ném 503 ngay. Đủ để kiểm tra
 * log lỗi được ghi và không làm thay đổi lỗi trả ra UI.
 */
describe('PlivoService — OTP log', () => {
  const opsLog = { logOtp: jest.fn(), logPush: jest.fn() };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  // Counter mặc định = 1 → chưa chạm trần, luồng gửi đi tiếp.
  const redis = { incrementWithExpiry: jest.fn().mockResolvedValue(1) };
  let service: PlivoService;

  beforeEach(() => {
    jest.clearAllMocks();
    redis.incrementWithExpiry.mockResolvedValue(1);
    service = new PlivoService(
      config as never,
      redis as unknown as RedisService,
      opsLog as unknown as OpsLogService,
    );
  });

  it('ghi log success=false khi gửi lỗi, vẫn ném 503 và không lộ mã OTP', async () => {
    await expect(service.sendOtp('+84912345678')).rejects.toThrow();

    expect(opsLog.logOtp).toHaveBeenCalledTimes(1);
    const calls = opsLog.logOtp.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    const entry = calls[0][0];
    expect(entry).toMatchObject({
      phone: '+84912345678',
      channel: 'sms',
      success: false,
      provider: 'plivo',
    });
    // Không có field mã OTP nào trong bản ghi.
    expect(entry).not.toHaveProperty('otp');
    expect(entry).not.toHaveProperty('code');
  });
});

describe('PlivoService — trần SMS (chống SMS pumping)', () => {
  const opsLog = { logOtp: jest.fn(), logPush: jest.fn() };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  let redis: { incrementWithExpiry: jest.Mock };
  let service: PlivoService;

  beforeEach(() => {
    jest.clearAllMocks();
    redis = { incrementWithExpiry: jest.fn() };
    service = new PlivoService(
      config as never,
      redis as unknown as RedisService,
      opsLog as unknown as OpsLogService,
    );
  });

  it('chặn khi số vượt 3 lượt/giờ — 429, không gọi nhà mạng', async () => {
    redis.incrementWithExpiry.mockResolvedValue(4);

    await expect(service.sendOtp('+84912345678')).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(service.sendOtp('+84912345678')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    // Chặn ở tầng quota nên không có log "gửi thất bại" của nhà mạng.
    expect(opsLog.logOtp).not.toHaveBeenCalled();
  });

  it('chặn theo IP khi vượt 10 lượt/giờ', async () => {
    // Số chưa chạm trần (1), IP chạm trần (11).
    redis.incrementWithExpiry
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(11);

    await expect(
      service.sendOtp('+84912345678', 'otp', { ip: '203.0.113.9' }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
      'sms:quota:ip:203.0.113.9',
      expect.any(Number),
    );
  });

  // Nếu đếm theo chuỗi thô thì +84912… và 0912… là hai bucket → đổi định dạng
  // là lách được trần.
  it('chuẩn hoá số trước khi đếm — +84 và 0 dùng chung bucket', async () => {
    redis.incrementWithExpiry.mockResolvedValue(1);

    await service.sendOtp('+84912345678').catch(() => undefined);
    await service.sendOtp('0912345678').catch(() => undefined);

    const keys = redis.incrementWithExpiry.mock.calls.map((c) => c[0]);
    const phoneKeys = keys.filter((k: string) =>
      k.startsWith('sms:quota:phone:'),
    );
    expect(phoneKeys).toHaveLength(2);
    expect(phoneKeys[0]).toBe(phoneKeys[1]);
  });

  it('không có IP thì bỏ qua lớp IP, không chặn oan', async () => {
    redis.incrementWithExpiry.mockResolvedValue(1);
    await service.sendOtp('+84912345678').catch(() => undefined);

    const keys = redis.incrementWithExpiry.mock.calls.map((c) => c[0]);
    expect(keys.some((k: string) => k.startsWith('sms:quota:ip:'))).toBe(false);
  });
});
