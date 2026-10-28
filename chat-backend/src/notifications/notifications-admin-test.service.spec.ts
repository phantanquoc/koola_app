import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../common/redis/redis.service';
import { OpsLogService } from '../ops/ops-log.service';

/**
 * Gửi thử từ trang admin: khác luồng push thường ở chỗ KHÔNG skip người đang
 * online, và trả số liệu thật thay vì void.
 */
describe('NotificationsService.sendAdminTestPush', () => {
  let service: NotificationsService;
  const usersService = { findById: jest.fn() };
  const opsLog = { logPush: jest.fn(), logOtp: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: UsersService, useValue: usersService },
        { provide: RedisService, useValue: {} },
        { provide: OpsLogService, useValue: opsLog },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  function user(over: Record<string, unknown> = {}) {
    return {
      _id: 'u1',
      accountType: 'personal',
      isOnline: false,
      settings: { notificationsEnabled: true },
      fcmTokens: [{ token: 't1' }],
      ...over,
    };
  }

  it('không có user → skipped=no_user', async () => {
    usersService.findById.mockResolvedValue(null);
    await expect(
      service.sendAdminTestPush({ userId: 'x', title: 't', body: 'b' }),
    ).resolves.toMatchObject({ skipped: 'no_user', tokenCount: 0 });
  });

  it('user tắt thông báo → skipped=notifications_disabled', async () => {
    usersService.findById.mockResolvedValue(
      user({ settings: { notificationsEnabled: false } }),
    );
    await expect(
      service.sendAdminTestPush({ userId: 'u1', title: 't', body: 'b' }),
    ).resolves.toMatchObject({ skipped: 'notifications_disabled' });
  });

  it('không có token → skipped=no_tokens', async () => {
    usersService.findById.mockResolvedValue(user({ fcmTokens: [] }));
    await expect(
      service.sendAdminTestPush({ userId: 'u1', title: 't', body: 'b' }),
    ).resolves.toMatchObject({ skipped: 'no_tokens' });
  });

  // Điểm khác luồng push thường: người đang online VẪN nhận để kiểm kênh FCM.
  it('user đang online vẫn gửi — mục đích là kiểm FCM, không phải chống trùng', async () => {
    usersService.findById.mockResolvedValue(user({ isOnline: true }));
    const multicast = jest
      .spyOn(
        service as unknown as {
          sendMulticast: (
            id: string,
            tokens: string[],
            payload: unknown,
          ) => Promise<{ successCount: number; failureCount: number }>;
        },
        'sendMulticast',
      )
      .mockResolvedValue({ successCount: 1, failureCount: 0 });

    const res = await service.sendAdminTestPush({
      userId: 'u1',
      title: 't',
      body: 'b',
    });

    expect(multicast).toHaveBeenCalledWith('u1', ['t1'], expect.any(Object));
    expect(res).toEqual({
      tokenCount: 1,
      successCount: 1,
      failureCount: 0,
    });
  });

  // "Firebase not configured" là lỗi cấu hình deploy, không phải token chết —
  // báo riêng để admin không đi tìm thiết bị hỏng.
  it('FCM chưa cấu hình → skipped=fcm_not_configured, không báo failure', async () => {
    usersService.findById.mockResolvedValue(user({ fcmTokens: [{ token: 'a' }] }));
    jest
      .spyOn(
        service as unknown as { sendMulticast: () => Promise<unknown> },
        'sendMulticast',
      )
      .mockRejectedValue(new ServiceUnavailableException('Firebase not configured'));

    const res = await service.sendAdminTestPush({
      userId: 'u1',
      title: 't',
      body: 'b',
    });

    expect(res).toEqual({
      tokenCount: 1,
      successCount: 0,
      failureCount: 0,
      skipped: 'fcm_not_configured',
    });
  });

  it('FCM lỗi → trả failure thay vì ném, vẫn ghi log vận hành', async () => {
    usersService.findById.mockResolvedValue(user({ fcmTokens: [{ token: 'a' }, { token: 'b' }] }));
    jest
      .spyOn(
        service as unknown as {
          sendMulticast: () => Promise<unknown>;
        },
        'sendMulticast',
      )
      .mockRejectedValue(new Error('fcm down'));

    const res = await service.sendAdminTestPush({
      userId: 'u1',
      title: 't',
      body: 'b',
    });

    expect(res).toEqual({
      tokenCount: 2,
      successCount: 0,
      failureCount: 2,
    });
    expect(opsLog.logPush).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'admin_test', failureCount: 2 }),
    );
  });
});
