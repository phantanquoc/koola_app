import { PlivoService } from './plivo.service';
import { OpsLogService } from '../ops/ops-log.service';

/**
 * Không set PLIVO_AUTH_* → client null, sendOtp ném 503 ngay. Đủ để kiểm tra
 * log lỗi được ghi và không làm thay đổi lỗi trả ra UI.
 */
describe('PlivoService — OTP log', () => {
  const opsLog = { logOtp: jest.fn(), logPush: jest.fn() };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  let service: PlivoService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PlivoService(
      config as never,
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
